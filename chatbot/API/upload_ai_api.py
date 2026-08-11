"""
Upload AI API

Provides two upload modes:
1) existing: pass-through upload to DMS (current behavior)
2) ai_filing: OCR first, classify doc type from first N pages, route to folder, then upload

Run locally:
    uvicorn upload_ai_api:app --host 0.0.0.0 --port 5201 --reload
"""

from __future__ import annotations

import io
import importlib
import json
import logging
import os
import re
import time
from uuid import uuid4
from dataclasses import dataclass
from typing import Any, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    _pypdf = importlib.import_module("pypdf")
    PdfReader = getattr(_pypdf, "PdfReader", None)
    PdfWriter = getattr(_pypdf, "PdfWriter", None)
except Exception:
    PdfReader = None
    PdfWriter = None

load_dotenv()

LOG_LEVEL = os.getenv("UPLOAD_AI_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("upload-ai-api")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}

DMS_BASE_URL = os.getenv("UPLOAD_AI_DMS_BASE_URL", "http://localhost:8080").rstrip("/")
OLLAMA_URL = os.getenv("UPLOAD_AI_OLLAMA_URL", "http://localhost:11434").rstrip("/")
LLM_MODEL = os.getenv("UPLOAD_AI_LLM_MODEL", "deepseek-r1:14b")

OCR_PROMPT_DEFAULT = os.getenv("UPLOAD_AI_OCR_PROMPT", "prompt_ocr")
OCR_CONFIDENCE_DEFAULT = int(os.getenv("UPLOAD_AI_OCR_CONFIDENCE", "95"))
MAX_DETECT_PAGES = int(os.getenv("UPLOAD_AI_DETECT_MAX_PAGES", "5"))

RAW_DOC_TYPES = os.getenv("UPLOAD_AI_DOC_TYPES", "letters,minutes,reports,others")
DOC_TYPES = [v.strip().lower() for v in RAW_DOC_TYPES.split(",") if v.strip()]
if not DOC_TYPES:
    DOC_TYPES = ["letters", "minutes", "reports", "bills", "others"]

# Mapping format supports either folder IDs or folder names.
# Examples:
#   {"letters": {"folderId": "abc123"}, "minutes": {"folderName": "minutes"}, "default": {"folderName": "reports"}}
#   {"letters": "letters", "minutes": "minutes", "reports": "reports", "others": "others", "default": "reports"}
RAW_MAP = os.getenv(
    "UPLOAD_AI_DOC_TYPE_FOLDER_MAP",
    '{"letters":"letters","minutes":"minutes","reports":"reports","bills":"bills","default":"others"}',
)
try:
    DOC_TYPE_FOLDER_MAP = json.loads(RAW_MAP)
except Exception:
    DOC_TYPE_FOLDER_MAP = {
        "letters": "letters",
        "minutes": "minutes",
        "reports": "reports",
        "bills": "bills",
        "default": "others",
    }

# Optional hard fallback folder ID when mapping resolution fails.
DEFAULT_FOLDER_ID = os.getenv("UPLOAD_AI_DEFAULT_FOLDER_ID", "").strip()

# Avoid double OCR/embedding by default in ai_filing upload, can be toggled.
RUN_POST_UPLOAD_PIPELINE = os.getenv("UPLOAD_AI_RUN_POST_UPLOAD_PIPELINE", "false").lower() == "true"
LOG_FOLDER_MAP_AT_INFO = _env_bool("UPLOAD_AI_LOG_FOLDER_MAP_AT_INFO", True)
LOG_LLM_RAW_RESPONSE_AT_INFO = _env_bool("UPLOAD_AI_LOG_LLM_RAW_RESPONSE_AT_INFO", True)

_raw_origins = os.getenv("UPLOAD_AI_CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]

logger.info(
    "Upload AI API config | log_level=%s | folder_map_info=%s | llm_raw_info=%s",
    LOG_LEVEL,
    LOG_FOLDER_MAP_AT_INFO,
    LOG_LLM_RAW_RESPONSE_AT_INFO,
)


@dataclass
class FolderNode:
    folder_id: str
    name: str
    children: list["FolderNode"]


app = FastAPI(title="Upload AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _auth_headers(authorization: Optional[str]) -> dict[str, str]:
    if authorization and authorization.strip():
        return {"Authorization": authorization.strip()}
    return {}


def _is_pdf(file_name: str, content_type: str) -> bool:
    by_name = bool(file_name and file_name.lower().endswith(".pdf"))
    by_type = bool(content_type and "pdf" in content_type.lower())
    return by_name or by_type


def _extract_pages_text(ocr_payload: dict[str, Any], max_pages: int) -> str:
    results = ocr_payload.get("results")
    if not isinstance(results, list):
        return ""

    rows: list[tuple[int, str]] = []
    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue

        raw_page_no = item.get("page_no", idx)
        page_no: int
        if isinstance(raw_page_no, int):
            page_no = raw_page_no + 1 if raw_page_no >= 0 else idx + 1
        elif isinstance(raw_page_no, str) and raw_page_no.strip().isdigit():
            parsed = int(raw_page_no.strip())
            page_no = parsed + 1 if parsed >= 0 else idx + 1
        else:
            page_no = idx + 1

        text = (
            str(item.get("md_content") or "").strip()
            or str(item.get("md_content_nohf") or "").strip()
            or str(item.get("content") or "").strip()
            or str(item.get("text") or "").strip()
        )
        if text:
            rows.append((page_no, text))

    if not rows:
        return ""

    rows.sort(key=lambda it: it[0])
    selected = [txt for page, txt in rows if page <= max_pages]
    return "\n\n--- PAGE BREAK ---\n\n".join(selected).strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    if not text:
        return {}

    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}

    try:
        return json.loads(match.group(0))
    except Exception:
        return {}


def _extract_first_pages_pdf(file_bytes: bytes, max_pages: int) -> bytes:
    if PdfReader is None or PdfWriter is None:
        raise HTTPException(
            status_code=500,
            detail="Missing dependency 'pypdf'. Install chatbot requirements to enable first-pages OCR classification.",
        )
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        total_pages = len(reader.pages)
        if total_pages <= 0:
            raise HTTPException(status_code=422, detail="Uploaded PDF has no pages")

        writer = PdfWriter()
        keep_pages = min(max_pages, total_pages)
        for page_index in range(keep_pages):
            writer.add_page(reader.pages[page_index])

        out_buffer = io.BytesIO()
        writer.write(out_buffer)
        extracted = out_buffer.getvalue()
        if not extracted:
            raise HTTPException(status_code=422, detail="Failed to extract first pages from PDF")

        logger.info(
            "Prepared first-pages PDF for classification | keep_pages=%s | total_pages=%s | bytes=%s",
            keep_pages,
            total_pages,
            len(extracted),
        )
        return extracted
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to extract first pages from PDF: {exc}") from exc


def _detect_doc_type(first_pages_text: str, detect_prompt: Optional[str]) -> dict[str, Any]:
    allowed = ", ".join(DOC_TYPES)

    prompt = f"""
Classify the document into exactly one type from this list:
{allowed}

Return JSON only:
{{
  "doc_type": "one_of_allowed_types",
  "confidence": 0.0,
  "reason": "short reason"
}}

Rules:
- Use only the first {MAX_DETECT_PAGES} pages content.
- If uncertain, return "other".
"""

    if detect_prompt and detect_prompt.strip():
        prompt += "\nAdditional business rule:\n" + detect_prompt.strip() + "\n"

    prompt += "\nDocument content:\n" + first_pages_text

    payload = {
        "model": LLM_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": "You are a strict document type classifier."},
            {"role": "user", "content": prompt},
        ],
        "parameters": {
            "temperature": 0.1,
            "top_p": 0.7,
            "top_k": 40,
            "max_tokens": 10000,
        },
    }

    try:
        logger.debug("Calling LLM for doc-type detection | model=%s | text_chars=%s", LLM_MODEL, len(first_pages_text))
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120,
        )
    except requests.exceptions.ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Ollama at {OLLAMA_URL}: {exc}") from exc
    except requests.exceptions.Timeout as exc:
        raise HTTPException(status_code=504, detail="Doc type classification request timed out") from exc

    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Ollama error {response.status_code}: {response.text[:400]}")

    try:
        content = response.json()["message"]["content"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected Ollama response format: {exc}") from exc

    if LOG_LLM_RAW_RESPONSE_AT_INFO:
        logger.info("LLM raw response | content=%s", content)
    else:
        logger.debug("LLM raw response | content=%s", content)

    parsed = _extract_json_object(content)
    doc_type = str(parsed.get("doc_type") or "").strip().lower()
    valid = {d.lower() for d in DOC_TYPES}
    if doc_type not in valid:
        doc_type = "other" if "other" in valid else DOC_TYPES[0]

    logger.debug("Doc-type detection done | detected=%s | confidence=%s", doc_type, parsed.get("confidence"))

    return {
        "doc_type": doc_type,
        "confidence": parsed.get("confidence"),
        "reason": str(parsed.get("reason") or "").strip() or "No reason provided.",
        "raw": content,
    }


def _parse_folder_tree(nodes: Any) -> list[FolderNode]:
    if not isinstance(nodes, list):
        return []

    out: list[FolderNode] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        folder_id = str(node.get("id") or "").strip()
        name = str(node.get("name") or "").strip()
        children = _parse_folder_tree(node.get("children") or [])
        if folder_id and name:
            out.append(FolderNode(folder_id=folder_id, name=name, children=children))
    return out


def _find_folder_id_by_name(nodes: list[FolderNode], target_name: str) -> Optional[str]:
    target = target_name.strip().lower()

    for node in nodes:
        if node.name.strip().lower() == target:
            return node.folder_id
        nested = _find_folder_id_by_name(node.children, target_name)
        if nested:
            return nested
    return None


def _fetch_folder_tree(authorization: Optional[str]) -> list[FolderNode]:
    logger.debug("Loading folder tree from DMS")
    response = requests.get(
        f"{DMS_BASE_URL}/api/folders/tree",
        headers=_auth_headers(authorization),
        timeout=60,
    )
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Cannot load DMS folder tree: {response.status_code} {response.text[:300]}")

    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Folder tree response is not valid JSON: {exc}") from exc

    parsed = _parse_folder_tree(payload)
    logger.debug("Loaded folder tree | root_nodes=%s", len(parsed))
    return parsed


def _resolve_mapping_entry(doc_type: str) -> Any:
    if not isinstance(DOC_TYPE_FOLDER_MAP, dict):
        return None

    normalized = {str(k).strip().lower(): v for k, v in DOC_TYPE_FOLDER_MAP.items()}
    return normalized.get(doc_type.lower(), normalized.get("default"))


def _resolve_folder_id_for_doc_type(doc_type: str, authorization: Optional[str]) -> str:
    mapping = _resolve_mapping_entry(doc_type)
    logger.debug("Resolving folder mapping | doc_type=%s | mapping_type=%s", doc_type, type(mapping).__name__)

    if isinstance(mapping, dict):
        folder_id = str(mapping.get("folderId") or mapping.get("folder_id") or "").strip()
        if folder_id:
            return folder_id

        folder_name = str(mapping.get("folderName") or mapping.get("folder_name") or "").strip()
        if folder_name:
            tree = _fetch_folder_tree(authorization)
            found = _find_folder_id_by_name(tree, folder_name)
            if found:
                logger.debug("Resolved folder by name | doc_type=%s | folder_name=%s | folder_id=%s", doc_type, folder_name, found)
                return found

    elif isinstance(mapping, str) and mapping.strip():
        # String mapping is treated as folder name first, then as direct folder ID fallback.
        value = mapping.strip()
        tree = _fetch_folder_tree(authorization)
        found = _find_folder_id_by_name(tree, value)
        if found:
            logger.debug("Resolved folder by string-name mapping | doc_type=%s | value=%s | folder_id=%s", doc_type, value, found)
            return found
        logger.debug("String mapping did not match folder name, treating as folder id | doc_type=%s | value=%s", doc_type, value)
        return value

    if DEFAULT_FOLDER_ID:
        return DEFAULT_FOLDER_ID

    raise HTTPException(
        status_code=400,
        detail=(
            f"No folder mapping found for doc_type={doc_type}. "
            "Configure UPLOAD_AI_DOC_TYPE_FOLDER_MAP or UPLOAD_AI_DEFAULT_FOLDER_ID."
        ),
    )


def _run_temp_ocr(
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    authorization: Optional[str],
    prompt: str,
    confidence: int,
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    logger.info(
        "Starting pre-upload OCR | request_id=%s | file=%s | content_type=%s | bytes=%s | prompt=%s | confidence=%s",
        request_id,
        file_name,
        content_type,
        len(file_bytes),
        prompt,
        confidence,
    )
    files = {
        "file": (file_name, file_bytes, content_type or "application/pdf"),
    }
    data = {
        "prompt": prompt,
        "confidence": str(confidence),
    }

    response = requests.post(
        f"{DMS_BASE_URL}/api/documents/ocr/pdf",
        files=files,
        data=data,
        headers=_auth_headers(authorization),
        timeout=300,
    )
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"DMS OCR failed: {response.status_code} {response.text[:400]}")

    try:
        payload = response.json()
        result_count = len(payload.get("results", [])) if isinstance(payload, dict) else 0
        logger.info("Pre-upload OCR completed | request_id=%s | file=%s | pages=%s", request_id, file_name, result_count)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DMS OCR response is not valid JSON: {exc}") from exc


def _upload_to_dms(
    metadata: dict[str, Any],
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    authorization: Optional[str],
) -> dict[str, Any]:
    logger.debug("Uploading document to DMS | file=%s | content_type=%s | folder_id=%s", file_name, content_type, metadata.get("folderId"))
    files = {
        "metadata": ("metadata.json", json.dumps(metadata, ensure_ascii=False), "application/json"),
        "file": (file_name, file_bytes, content_type or "application/octet-stream"),
    }

    response = requests.post(
        f"{DMS_BASE_URL}/api/documents",
        files=files,
        headers=_auth_headers(authorization),
        timeout=180,
    )

    if not response.ok:
        raise HTTPException(status_code=response.status_code, detail=f"DMS upload failed: {response.text[:500]}")

    try:
        payload = response.json()
        logger.debug("DMS upload completed | document_id=%s", payload.get("id") if isinstance(payload, dict) else None)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DMS upload returned invalid JSON: {exc}") from exc


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "dms_base_url": DMS_BASE_URL,
        "ollama_url": OLLAMA_URL,
        "model": LLM_MODEL,
        "max_detect_pages": MAX_DETECT_PAGES,
        "doc_types": DOC_TYPES,
        "doc_type_folder_map": DOC_TYPE_FOLDER_MAP,
        "default_folder_id": DEFAULT_FOLDER_ID,
        "run_post_upload_pipeline": RUN_POST_UPLOAD_PIPELINE,
    }


@app.post("/upload")
async def upload(
    mode: str = Form("existing"),
    metadata_json: str = Form(...),
    file: UploadFile = File(...),
    detect_prompt: Optional[str] = Form(None),
    ocr_prompt: str = Form(OCR_PROMPT_DEFAULT),
    ocr_confidence: int = Form(OCR_CONFIDENCE_DEFAULT),
    authorization: Optional[str] = Header(None),
) -> dict[str, Any]:
    request_id = str(uuid4())[:8]
    started_at = time.perf_counter()
    try:
        metadata = json.loads(metadata_json)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"metadata_json must be valid JSON: {exc}") from exc

    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata_json must be a JSON object")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    file_name = file.filename or "upload.bin"
    content_type = file.content_type or "application/octet-stream"
    normalized_mode = mode.strip().lower()

    logger.info(
        "Upload request received | request_id=%s | mode=%s | file=%s | content_type=%s | bytes=%s",
        request_id,
        normalized_mode,
        file_name,
        content_type,
        len(file_bytes),
    )

    if normalized_mode == "existing":
        uploaded = _upload_to_dms(metadata, file_name, content_type, file_bytes, authorization)
        logger.info(
            "Upload existing mode completed | request_id=%s | document_id=%s | elapsed_ms=%.1f",
            request_id,
            uploaded.get("id") if isinstance(uploaded, dict) else None,
            (time.perf_counter() - started_at) * 1000,
        )
        return {
            "mode": "existing",
            "uploaded": uploaded,
        }

    if normalized_mode != "ai_filing":
        raise HTTPException(status_code=400, detail="mode must be one of: existing, ai_filing")

    if LOG_FOLDER_MAP_AT_INFO:
        logger.info(
            "AI filing folder map | doc_types=%s | folder_map=%s | default_folder_id=%s",
            DOC_TYPES,
            DOC_TYPE_FOLDER_MAP,
            DEFAULT_FOLDER_ID,
        )
    else:
        logger.debug(
            "AI filing folder map | doc_types=%s | folder_map=%s | default_folder_id=%s",
            DOC_TYPES,
            DOC_TYPE_FOLDER_MAP,
            DEFAULT_FOLDER_ID,
        )

    if not _is_pdf(file_name, content_type):
        raise HTTPException(status_code=400, detail="ai_filing mode currently supports PDF only")

    # Stage 1: OCR only the first N pages for fast classification.
    first_pages_pdf_bytes = _extract_first_pages_pdf(file_bytes, MAX_DETECT_PAGES)
    logger.info(
        "Prepared first-pages OCR input | request_id=%s | source_bytes=%s | first_pages_bytes=%s | max_pages=%s",
        request_id,
        len(file_bytes),
        len(first_pages_pdf_bytes),
        MAX_DETECT_PAGES,
    )

    ocr_payload = _run_temp_ocr(
        file_name=file_name,
        content_type=content_type,
        file_bytes=first_pages_pdf_bytes,
        authorization=authorization,
        prompt=ocr_prompt,
        confidence=ocr_confidence,
        request_id=request_id,
    )

    first_pages_text = _extract_pages_text(ocr_payload, MAX_DETECT_PAGES)
    if not first_pages_text:
        raise HTTPException(status_code=422, detail="OCR succeeded but first pages text is empty")

    detection = _detect_doc_type(first_pages_text, detect_prompt)
    target_folder_id = _resolve_folder_id_for_doc_type(detection["doc_type"], authorization)
    logger.info(
        "AI filing classification done | request_id=%s | detected=%s | target_folder_id=%s",
        request_id,
        detection.get("doc_type"),
        target_folder_id,
    )

    # Route to the detected folder.
    metadata["folderId"] = target_folder_id

    # Use detected type as category if caller did not explicitly set one.
    if not metadata.get("category"):
        metadata["category"] = detection["doc_type"]

    # Respect user selection for post-upload OCR/extraction/embedding in mode2.
    run_ocr_after_upload = bool(metadata.get("runOcr"))
    run_extraction_after_upload = bool(metadata.get("runDataExtraction"))
    run_embedding_after_upload = bool(metadata.get("runEmbedding"))

    logger.info(
        "Mode2 post-upload pipeline flags | request_id=%s | runOcr=%s | runDataExtraction=%s | runEmbedding=%s",
        request_id,
        run_ocr_after_upload,
        run_extraction_after_upload,
        run_embedding_after_upload,
    )

    if not RUN_POST_UPLOAD_PIPELINE and not run_ocr_after_upload and not run_extraction_after_upload and not run_embedding_after_upload:
        metadata["runOcr"] = False
        metadata["runDataExtraction"] = False
        metadata["runEmbedding"] = False

    uploaded = _upload_to_dms(metadata, file_name, content_type, file_bytes, authorization)
    logger.info(
        "Upload ai_filing mode completed | request_id=%s | document_id=%s | detected=%s | elapsed_ms=%.1f",
        request_id,
        uploaded.get("id") if isinstance(uploaded, dict) else None,
        detection.get("doc_type"),
        (time.perf_counter() - started_at) * 1000,
    )
    return {
        "mode": "ai_filing",
        "pre_ocr": {
            "performed": True,
            "input_pages": MAX_DETECT_PAGES,
            "input_bytes": len(first_pages_pdf_bytes),
            "prompt": ocr_prompt,
            "confidence": ocr_confidence,
        },
        "detection": detection,
        "routing": {
            "target_folder_id": target_folder_id,
            "max_pages_used": MAX_DETECT_PAGES,
        },
        "uploaded": uploaded,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "upload_ai_api:app",
        host="0.0.0.0",
        port=int(os.getenv("UPLOAD_AI_API_PORT", "5201")),
        reload=True,
    )
