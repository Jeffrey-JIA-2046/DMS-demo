import json
import os
import sys
import time
from typing import Any

import requests
from opensearchpy import OpenSearch


def getenv_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()


def build_client() -> OpenSearch:
    host = os.getenv("CHATBOT_OPENSEARCH_HOST", "localhost")
    port = int(os.getenv("CHATBOT_OPENSEARCH_PORT", "9200"))
    username = os.getenv("CHATBOT_OPENSEARCH_USERNAME", "admin")
    password = os.getenv("CHATBOT_OPENSEARCH_PASSWORD", "ASLgemini916")
    use_ssl = getenv_bool("CHATBOT_OPENSEARCH_USE_SSL", True)
    verify_certs = getenv_bool("CHATBOT_OPENSEARCH_VERIFY_CERTS", False)

    return OpenSearch(
        hosts=[{"host": host, "port": port}],
        http_compress=True,
        http_auth=(username, password),
        use_ssl=use_ssl,
        verify_certs=verify_certs,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )


def extract_ocr_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return []

    if not isinstance(payload, dict):
        return []

    results = payload.get("results")
    if isinstance(results, list):
        return [item for item in results if isinstance(item, dict)]

    for key in ("response_json", "ocr_response_json", "payload", "data"):
        nested = payload.get(key)
        nested_results = extract_ocr_results(nested)
        if nested_results:
            return nested_results

    return []


def fetch_ocr_payload(es: OpenSearch, ocr_index: str, document_id: str) -> dict[str, Any] | None:
    try:
        res = es.get(index=ocr_index, id=document_id)
        source = (res or {}).get("_source")
        if isinstance(source, dict) and extract_ocr_results(source):
            return source
    except Exception:
        pass

    for field in ("document_id.keyword", "document_id"):
        try:
            body = {
                "size": 1,
                "query": {
                    "term": {
                        field: document_id,
                    }
                },
            }
            res = es.search(index=ocr_index, body=body)
            hits = (((res or {}).get("hits") or {}).get("hits") or [])
            if not hits:
                continue
            source = (hits[0] or {}).get("_source")
            if isinstance(source, dict) and extract_ocr_results(source):
                return source
        except Exception:
            continue

    return None


def build_ocr_text_from_payload(ocr_payload: dict[str, Any]) -> str:
    results = extract_ocr_results(ocr_payload)
    parts: list[str] = []
    for item in results:
        content = clean_text(item.get("md_content") or item.get("md_content_nohf") or item.get("text") or item.get("content"))
        if content:
            parts.append(content)
    return "\n\n".join(parts)


def to_embedding_request(document_id: str, doc_source: dict[str, Any], ocr_payload: dict[str, Any]) -> dict[str, Any]:
    ocr_text = clean_text(doc_source.get("ocr_content"))
    if not ocr_text:
        ocr_text = build_ocr_text_from_payload(ocr_payload)

    metadata = doc_source.get("document_metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    tags = doc_source.get("tags")
    if not isinstance(tags, list):
        tags = []

    breadcrumbs = doc_source.get("folder_breadcrumbs")
    if not isinstance(breadcrumbs, list):
        breadcrumbs = []

    return {
        "document_id": document_id,
        "title": clean_text(doc_source.get("title")) or document_id,
        "description": clean_text(doc_source.get("description")) or None,
        "ocr_text": ocr_text,
        "ocr_response_json": ocr_payload,
        "category": clean_text(doc_source.get("category")) or None,
        "owner": clean_text(doc_source.get("owner")) or None,
        "tags": [str(x).strip() for x in tags if str(x).strip()],
        "document_metadata": {str(k): str(v) for k, v in metadata.items() if str(k).strip() and str(v).strip()},
        "folder_name": clean_text(doc_source.get("folder_name")) or None,
        "folder_path": clean_text(doc_source.get("folder_path")) or None,
        "folder_breadcrumbs": [str(x).strip() for x in breadcrumbs if str(x).strip()],
        "created_at": clean_text(doc_source.get("created_at")) or None,
        "force_reindex": True,
    }


def main() -> int:
    es = build_client()

    documents_index = os.getenv("CHATBOT_SEARCH_INDEX_NAME", "dms-documents-chatbot")
    ocr_index = os.getenv("CHATBOT_OCR_DOCUMENT_INDEX_NAME", "dms-ocr-document")
    embedding_api_base = os.getenv("EMBEDDING_API_BASE_URL", "http://localhost:5101")
    embed_jobs_url = embedding_api_base.rstrip("/") + "/embed/jobs"

    batch_size = int(os.getenv("REEMBED_BATCH_SIZE", "100"))
    max_docs = int(os.getenv("REEMBED_MAX_DOCS", "0"))
    sleep_ms = int(os.getenv("REEMBED_SLEEP_MS", "50"))

    submitted = 0
    skipped_no_ocr = 0
    failed_submit = 0
    scanned = 0

    search_after = None

    print("Starting re-embed backfill")
    print(f"documents_index={documents_index}")
    print(f"ocr_index={ocr_index}")
    print(f"embed_jobs_url={embed_jobs_url}")

    while True:
        query = {
            "size": batch_size,
            "sort": [
                {"_id": "asc"}
            ],
            "_source": [
                "title",
                "description",
                "ocr_content",
                "category",
                "owner",
                "tags",
                "document_metadata",
                "folder_name",
                "folder_path",
                "folder_breadcrumbs",
                "created_at"
            ],
            "query": {
                "match_all": {}
            }
        }

        if search_after is not None:
            query["search_after"] = search_after

        res = es.search(index=documents_index, body=query)
        hits = (((res or {}).get("hits") or {}).get("hits") or [])
        if not hits:
            break

        for hit in hits:
            scanned += 1
            document_id = str(hit.get("_id") or "").strip()
            source = hit.get("_source") or {}

            if not document_id:
                continue

            ocr_payload = fetch_ocr_payload(es, ocr_index, document_id)
            if not ocr_payload:
                skipped_no_ocr += 1
                continue

            body = to_embedding_request(document_id, source, ocr_payload)
            if not clean_text(body.get("ocr_text")):
                skipped_no_ocr += 1
                continue

            try:
                resp = requests.post(embed_jobs_url, json=body, timeout=30)
                if resp.ok:
                    submitted += 1
                else:
                    failed_submit += 1
                    print(f"submit failed document_id={document_id} status={resp.status_code} body={resp.text[:200]}")
            except Exception as exc:
                failed_submit += 1
                print(f"submit exception document_id={document_id} error={exc}")

            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)

            if max_docs > 0 and scanned >= max_docs:
                break

        if max_docs > 0 and scanned >= max_docs:
            break

        search_after = hits[-1].get("sort")
        if not search_after:
            break

    print("Done")
    print(f"scanned={scanned}")
    print(f"submitted={submitted}")
    print(f"skipped_no_ocr={skipped_no_ocr}")
    print(f"failed_submit={failed_submit}")
    return 0 if failed_submit == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
