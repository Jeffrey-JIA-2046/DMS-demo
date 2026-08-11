"""
Document chunking and embedding API.

This service accepts OCR text from DMS, chunks it, generates E5 embeddings,
and upserts the result into the chatbot search index so hybrid search can use
both text and vector retrieval.

Run locally:
    uvicorn embedding_api:app --host 0.0.0.0 --port 5101 --reload
"""

from __future__ import annotations

import logging
import os
import threading
import json
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

import hanzidentifier
import nltk
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from opensearchpy import NotFoundError, OpenSearch
from pydantic import BaseModel, Field
from pysbd import Segmenter

load_dotenv()

logger = logging.getLogger("dms-embedding-api")
logging.basicConfig(level=logging.INFO)

nltk.download("punkt", quiet=True)
SEGMENTER_EN = Segmenter(language="en", clean=False)
SEGMENTER_ZH = Segmenter(language="zh", clean=False)

OPENSEARCH_HOST = os.getenv("CHATBOT_OPENSEARCH_HOST", "localhost")
OPENSEARCH_PORT = int(os.getenv("CHATBOT_OPENSEARCH_PORT", "9200"))
OPENSEARCH_USERNAME = os.getenv("CHATBOT_OPENSEARCH_USERNAME", "admin")
OPENSEARCH_PASSWORD = os.getenv("CHATBOT_OPENSEARCH_PASSWORD", "ASLgemini916")
OPENSEARCH_USE_SSL = os.getenv("CHATBOT_OPENSEARCH_USE_SSL", "true").lower() == "true"
OPENSEARCH_VERIFY_CERTS = os.getenv("CHATBOT_OPENSEARCH_VERIFY_CERTS", "false").lower() == "true"

DEFAULT_SEARCH_INDEX_NAME = "dms-documents-chatbot"
SEARCH_INDEX_NAME = (
    os.getenv("CHATBOT_SEARCH_INDEX_NAME")
    or os.getenv("EMBEDDING_SEARCH_INDEX_NAME")
    or (os.getenv("SEARCH_INDEX_NAME") if os.getenv("SEARCH_INDEX_NAME") not in {None, "", "dms-documents"} else None)
    or DEFAULT_SEARCH_INDEX_NAME
)
DEFAULT_CHUNK_SEARCH_INDEX_NAME = "dms-documents-chatbot-chunks"
CHUNK_SEARCH_INDEX_NAME = (
    os.getenv("CHATBOT_CHUNK_SEARCH_INDEX_NAME")
    or os.getenv("SEARCH_CHUNK_INDEX_NAME")
    or DEFAULT_CHUNK_SEARCH_INDEX_NAME
)
EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH", "./local_models/multilingual-e5-small")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))
MAX_CHUNK_SIZE = int(os.getenv("EMBEDDING_MAX_CHUNK_SIZE", "250"))
TITLE_VECTOR_FIELD = os.getenv("SEARCH_TITLE_VECTOR_FIELD", "chatbot_title_embedding")
CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")
CHUNKS_FIELD = os.getenv("SEARCH_CHUNKS_FIELD", "chatbot_ocr_content_chunks")
CHUNK_TEXT_FIELD = os.getenv("SEARCH_CHUNK_TEXT_FIELD", "chunk_text")
CHUNK_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_VECTOR_FIELD", "chunk_embedding")
CHUNK_TITLE_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_TITLE_VECTOR_FIELD", "title_embedding")
CHUNK_CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_CONTENT_VECTOR_FIELD", CONTENT_VECTOR_FIELD)

_raw_origins = os.getenv("EMBEDDING_CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="Document Embedding API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

es = OpenSearch(
    hosts=[{"host": OPENSEARCH_HOST, "port": OPENSEARCH_PORT}],
    http_compress=True,
    http_auth=(OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD),
    use_ssl=OPENSEARCH_USE_SSL,
    verify_certs=OPENSEARCH_VERIFY_CERTS,
    ssl_assert_hostname=False,
    ssl_show_warn=False,
)

_embedding_model = None
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


class EmbeddingJobRequest(BaseModel):
    document_id: str = Field(min_length=1)
    title: str = ""
    description: Optional[str] = None
    ocr_text: str = Field(min_length=1)
    ocr_response_json: Optional[dict[str, Any]] = None
    category: Optional[str] = None
    owner: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    document_metadata: dict[str, str] = Field(default_factory=dict)
    folder_name: Optional[str] = None
    folder_path: Optional[str] = None
    folder_breadcrumbs: list[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    force_reindex: bool = False


class EmbeddingJobStartResponse(BaseModel):
    job_id: str
    status: str
    message: str


class EmbeddingJobStatusResponse(BaseModel):
    job_id: str
    status: str
    message: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _update_job(job_id: str, **changes: Any) -> None:
    with _jobs_lock:
        current = _jobs.get(job_id)
        if not current:
            return
        current.update(changes)


def _get_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        current = _jobs.get(job_id)
        if not current:
            raise KeyError(job_id)
        return dict(current)


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model

    try:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_PATH)
        logger.info("Loaded embedding model from %s", EMBEDDING_MODEL_PATH)
        return _embedding_model
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unable to load embedding model")
        raise RuntimeError(f"Failed to load embedding model: {exc}") from exc


def clean_text(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    return " ".join(text.split()).strip()


def clean_string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = clean_text(value)
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
    return cleaned


def clean_metadata_map(values: Any) -> dict[str, str]:
    if not isinstance(values, dict):
        return {}
    cleaned: dict[str, str] = {}
    for raw_key, raw_value in values.items():
        key = clean_text(raw_key)
        value = clean_text(raw_value)
        if key and value:
            cleaned[key] = value
    return cleaned


def build_metadata_entries(values: dict[str, str]) -> list[dict[str, str]]:
    return [{"key": key, "value": value} for key, value in values.items()]


def build_metadata_text(values: dict[str, str]) -> str:
    if not values:
        return ""
    return " ".join(f"{key}: {value}" for key, value in values.items())


def is_chinese_char(char: str) -> bool:
    return "\u4e00" <= char <= "\u9fff" or char in {"，", "。", "！", "？", "；", "：", "、"}


def detect_primary_language(text: str, sample_size: int = 100) -> str:
    normalized = clean_text(text)
    if not normalized:
        return "en"

    sample = normalized[:sample_size]
    try:
        if hanzidentifier.has_chinese(sample):
            return "zh"
        return "en"
    except Exception:  # noqa: BLE001
        pass

    chinese_count = sum(1 for char in sample if is_chinese_char(char))
    return "zh" if chinese_count > len(sample) / 2 else "en"


def segment_text(text: str, language: str) -> list[str]:
    normalized = clean_text(text)
    if not normalized:
        return []
    segmenter = SEGMENTER_ZH if language == "zh" else SEGMENTER_EN
    return [segment.strip() for segment in segmenter.segment(normalized) if segment.strip()]


def calculate_chunk_size(text: str, language: str) -> int:
    normalized = clean_text(text)
    if not normalized:
        return 0
    return len(normalized) if language == "zh" else len(normalized.split())


def chunk_text(text: str) -> list[str]:
    normalized = clean_text(text)
    if not normalized:
        return []

    sentences = segment_text(normalized, detect_primary_language(normalized))
    if not sentences:
        return []
    if len(sentences) == 1:
        return sentences

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_length = 0

    for index, sentence in enumerate(sentences):
        sentence_lang = detect_primary_language(sentence)
        sentence_length = calculate_chunk_size(sentence, sentence_lang)
        current_chunk.append(sentence)
        current_length += sentence_length

        if current_length >= MAX_CHUNK_SIZE or index == len(sentences) - 1:
            chunks.append(" ".join(current_chunk))
            if index < len(sentences) - 1:
                current_chunk = [sentence]
                current_length = sentence_length
            else:
                current_chunk = []
                current_length = 0

    return [chunk for chunk in chunks if chunk]


def extract_page_entries_from_ocr_response(ocr_response_json: Any) -> list[dict[str, Any]]:
    def _to_object(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:  # noqa: BLE001
                return value
        return value

    normalized = _to_object(ocr_response_json)
    if not isinstance(normalized, dict):
        return []

    raw_results = normalized.get("results")
    if not isinstance(raw_results, list):
        for key in ("response_json", "ocr_response_json", "data", "payload"):
            nested = _to_object(normalized.get(key))
            if isinstance(nested, dict) and isinstance(nested.get("results"), list):
                raw_results = nested.get("results")
                break

    if not isinstance(raw_results, list):
        return []

    page_entries: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_results):
        item = _to_object(item)
        if not isinstance(item, dict):
            continue
        content = clean_text(
            item.get("md_content")
            or item.get("md_content_nohf")
            or item.get("content")
            or item.get("text")
            or ""
        )
        if not content:
            continue

        raw_page_no = item.get("page_no")
        if raw_page_no is None:
            raw_page_no = item.get("pageNo")
        if raw_page_no is None:
            raw_page_no = item.get("page")
        page_number: Optional[int] = None
        if isinstance(raw_page_no, int):
            # OCR response page_no is zero-based in practice.
            page_number = raw_page_no + 1 if raw_page_no >= 0 else None
        elif isinstance(raw_page_no, str) and raw_page_no.strip().isdigit():
            parsed = int(raw_page_no.strip())
            page_number = parsed + 1 if parsed >= 0 else None

        if page_number is None:
            page_number = idx + 1

        page_entries.append({"page": page_number, "text": content})

    return page_entries


def build_chunk_records_from_page_entries(page_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sentence_records: list[dict[str, Any]] = []
    for entry in page_entries:
        page_number = entry["page"]
        page_text = clean_text(entry["text"])
        if not page_text:
            continue

        sentences = segment_text(page_text, detect_primary_language(page_text))
        if not sentences:
            sentences = [page_text]

        for sentence in sentences:
            sentence_records.append({"text": sentence, "page": page_number})

    if not sentence_records:
        return []

    if len(sentence_records) == 1:
        single = sentence_records[0]
        return [
            {
                "text": single["text"],
                "page": single["page"],
                "page_start": single["page"],
                "page_end": single["page"],
            }
        ]

    chunk_records: list[dict[str, Any]] = []
    current_chunk_sentences: list[str] = []
    current_chunk_pages: list[int] = []
    current_length = 0

    for index, sentence_record in enumerate(sentence_records):
        sentence = sentence_record["text"]
        sentence_page = sentence_record["page"]
        sentence_lang = detect_primary_language(sentence)
        sentence_length = calculate_chunk_size(sentence, sentence_lang)

        current_chunk_sentences.append(sentence)
        current_chunk_pages.append(sentence_page)
        current_length += sentence_length

        if current_length >= MAX_CHUNK_SIZE or index == len(sentence_records) - 1:
            page_start = min(current_chunk_pages)
            page_end = max(current_chunk_pages)
            chunk_records.append(
                {
                    "text": " ".join(current_chunk_sentences),
                    "page": page_start,
                    "page_start": page_start,
                    "page_end": page_end,
                }
            )

            if index < len(sentence_records) - 1:
                # Keep one-sentence overlap between adjacent chunks for continuity.
                current_chunk_sentences = [sentence]
                current_chunk_pages = [sentence_page]
                current_length = sentence_length
            else:
                current_chunk_sentences = []
                current_chunk_pages = []
                current_length = 0

    return [record for record in chunk_records if record.get("text")]


def build_chunk_records(ocr_text: str, ocr_response_json: Any = None) -> list[dict[str, Any]]:
    page_entries = extract_page_entries_from_ocr_response(ocr_response_json)
    if not page_entries:
        raise ValueError("ocr_response_json.results with page_no and md_content is required for page-aware embedding")

    chunk_records = build_chunk_records_from_page_entries(page_entries)
    if not chunk_records:
        raise ValueError("ocr_response_json.results has no usable md_content for embedding")
    return chunk_records


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    cleaned = [clean_text(text) for text in texts if clean_text(text)]
    if not cleaned:
        return []

    model = _get_embedding_model()
    prefixed = [f"passage: {text}" for text in cleaned]
    embeddings = model.encode(prefixed, normalize_embeddings=True)
    return embeddings.tolist()


def aggregate_embeddings(embeddings: list[list[float]]) -> Optional[list[float]]:
    if not embeddings:
        return None
    dimension = len(embeddings[0])
    totals = [0.0] * dimension
    for embedding in embeddings:
        for index, value in enumerate(embedding):
            totals[index] += float(value)
    count = float(len(embeddings))
    averaged = [value / count for value in totals]
    magnitude = sum(value * value for value in averaged) ** 0.5
    if magnitude > 0:
        averaged = [value / magnitude for value in averaged]
    return averaged


def _default_index_body() -> dict[str, Any]:
    return {
        "settings": {
            "index": {
                "knn": True,
            }
        },
        "mappings": {
            "properties": {
                "document_id": {"type": "keyword"},
                "title": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 512},
                    },
                },
                "description": {"type": "text"},
                "ocr_content": {"type": "text"},
                "category": {"type": "keyword"},
                "owner": {"type": "keyword"},
                "tags": {"type": "keyword"},
                "folder_name": {"type": "keyword"},
                "folder_path": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 1024},
                    },
                },
                "folder_breadcrumbs": {"type": "keyword"},
                "document_metadata": {"type": "object", "enabled": True},
                "metadata_text": {"type": "text"},
                "metadata_entries": {
                    "type": "nested",
                    "properties": {
                        "key": {"type": "keyword"},
                        "value": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword", "ignore_above": 1024},
                            },
                        },
                    },
                },
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
                TITLE_VECTOR_FIELD: {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "faiss",
                    },
                },
                CONTENT_VECTOR_FIELD: {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "faiss",
                    },
                },
                CHUNKS_FIELD: {
                    "type": "nested",
                    "properties": {
                        "text": {"type": "text"},
                        "page": {"type": "integer"},
                        "page_start": {"type": "integer"},
                        "page_end": {"type": "integer"},
                        "embedding": {
                            "type": "knn_vector",
                            "dimension": EMBEDDING_DIMENSION,
                            "method": {
                                "name": "hnsw",
                                "space_type": "cosinesimil",
                                "engine": "faiss",
                            },
                        },
                    },
                },
            }
        },
    }


def _default_chunk_index_body() -> dict[str, Any]:
    return {
        "settings": {
            "index": {
                "knn": True,
            }
        },
        "mappings": {
            "properties": {
                "chunk_id": {"type": "keyword"},
                "chunk_index": {"type": "integer"},
                "page": {"type": "integer"},
                "page_start": {"type": "integer"},
                "page_end": {"type": "integer"},
                CHUNK_TEXT_FIELD: {"type": "text"},
                "ocr_content": {"type": "text"},
                CHUNK_VECTOR_FIELD: {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "faiss",
                    },
                },
                CHUNK_TITLE_VECTOR_FIELD: {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "faiss",
                    },
                },
                CHUNK_CONTENT_VECTOR_FIELD: {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "faiss",
                    },
                },
                "document_id": {"type": "keyword"},
                "title": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 512},
                    },
                },
                "category": {"type": "keyword"},
                "owner": {"type": "keyword"},
                "tags": {"type": "keyword"},
                "folder_name": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 512},
                    },
                },
                "folder_path": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 1024},
                    },
                },
                "folder_breadcrumbs": {"type": "text"},
                "document_metadata": {
                    "properties": {
                        "archiveDate": {"type": "date"},
                        "documentDate": {"type": "date"},
                        "expiryDate": {"type": "date"},
                    }
                },
                "metadata_text": {"type": "text"},
                "metadata_entries": {
                    "type": "nested",
                    "properties": {
                        "key": {"type": "keyword"},
                        "value": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword", "ignore_above": 1024},
                            },
                        },
                    },
                },
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
            }
        },
    }


def ensure_search_index() -> None:
    if not es.indices.exists(index=SEARCH_INDEX_NAME):
        es.indices.create(index=SEARCH_INDEX_NAME, body=_default_index_body())
        logger.info("Created search index %s", SEARCH_INDEX_NAME)
        return

    try:
        es.indices.put_mapping(index=SEARCH_INDEX_NAME, body=_default_index_body()["mappings"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to update index mapping for %s: %s", SEARCH_INDEX_NAME, exc)


def ensure_chunk_search_index() -> None:
    if not es.indices.exists(index=CHUNK_SEARCH_INDEX_NAME):
        es.indices.create(index=CHUNK_SEARCH_INDEX_NAME, body=_default_chunk_index_body())
        logger.info("Created chunk search index %s", CHUNK_SEARCH_INDEX_NAME)
        return

    try:
        es.indices.put_mapping(index=CHUNK_SEARCH_INDEX_NAME, body=_default_chunk_index_body()["mappings"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to update chunk index mapping for %s: %s", CHUNK_SEARCH_INDEX_NAME, exc)


def _load_existing_document(document_id: str) -> dict[str, Any]:
    try:
        response = es.get(index=SEARCH_INDEX_NAME, id=document_id)
        return dict(response.get("_source", {}))
    except NotFoundError:
        return {}


def _index_document(document_id: str, request: EmbeddingJobRequest) -> dict[str, Any]:
    ensure_search_index()
    ensure_chunk_search_index()

    title = clean_text(request.title)
    description = clean_text(request.description)
    ocr_text = clean_text(request.ocr_text)
    if not ocr_text:
        raise ValueError("OCR text is empty after cleaning")

    tags = clean_string_list(request.tags)
    document_metadata = clean_metadata_map(request.document_metadata)
    folder_name = clean_text(request.folder_name)
    folder_path = clean_text(request.folder_path)
    folder_breadcrumbs = clean_string_list(request.folder_breadcrumbs)
    metadata_entries = build_metadata_entries(document_metadata)
    metadata_text = build_metadata_text(document_metadata)

    chunk_records = build_chunk_records(ocr_text, request.ocr_response_json)
    chunks = [record["text"] for record in chunk_records]

    chunk_embeddings = generate_embeddings(chunks)
    if not chunk_embeddings:
        raise RuntimeError("Failed to generate embeddings for OCR content")

    title_embedding = generate_embeddings([title])[0] if title else None
    content_embedding = aggregate_embeddings(chunk_embeddings)
    if content_embedding is None:
        raise RuntimeError("Failed to aggregate OCR content embeddings")

    existing = _load_existing_document(document_id)
    now = _utc_now_iso()

    payload = {
        **existing,
        "document_id": document_id,
        "title": title or existing.get("title") or document_id,
        "description": description if description else existing.get("description"),
        "ocr_content": ocr_text,
        "category": request.category if request.category is not None else existing.get("category"),
        "owner": request.owner if request.owner is not None else existing.get("owner"),
        "tags": tags if tags else existing.get("tags"),
        "document_metadata": document_metadata if document_metadata else existing.get("document_metadata"),
        "metadata_entries": metadata_entries if metadata_entries else existing.get("metadata_entries"),
        "metadata_text": metadata_text if metadata_text else existing.get("metadata_text"),
        "folder_name": folder_name if folder_name else existing.get("folder_name"),
        "folder_path": folder_path if folder_path else existing.get("folder_path"),
        "folder_breadcrumbs": folder_breadcrumbs if folder_breadcrumbs else existing.get("folder_breadcrumbs"),
        "created_at": request.created_at or existing.get("created_at") or now,
        "updated_at": now,
        CONTENT_VECTOR_FIELD: content_embedding,
        CHUNKS_FIELD: [
            {
                "text": chunk_record["text"],
                "page": chunk_record.get("page"),
                "page_start": chunk_record.get("page_start"),
                "page_end": chunk_record.get("page_end"),
                "embedding": embedding,
            }
            for chunk_record, embedding in zip(chunk_records, chunk_embeddings)
        ],
    }
    if title_embedding is not None:
        payload[TITLE_VECTOR_FIELD] = title_embedding

    payload = {key: value for key, value in payload.items() if value is not None}
    es.index(index=SEARCH_INDEX_NAME, id=document_id, body=payload, refresh=True)

    try:
        es.delete_by_query(
            index=CHUNK_SEARCH_INDEX_NAME,
            body={"query": {"term": {"document_id": document_id}}},
            refresh=True,
            conflicts="proceed",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to clear existing chunks for %s: %s", document_id, exc)

    resolved_title = payload.get("title")
    resolved_category = payload.get("category")
    resolved_owner = payload.get("owner")
    resolved_tags = payload.get("tags")
    resolved_folder_name = payload.get("folder_name")
    resolved_folder_path = payload.get("folder_path")
    resolved_folder_breadcrumbs = payload.get("folder_breadcrumbs")
    resolved_document_metadata = payload.get("document_metadata")
    resolved_metadata_text = payload.get("metadata_text")
    resolved_metadata_entries = payload.get("metadata_entries")
    resolved_created_at = payload.get("created_at")

    chunk_count = 0
    for chunk_index, (chunk_record, chunk_embedding) in enumerate(zip(chunk_records, chunk_embeddings), start=1):
        chunk_value = chunk_record["text"]
        chunk_id = f"{document_id}::chunk::{chunk_index}"
        chunk_doc = {
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "page": chunk_record.get("page"),
            "page_start": chunk_record.get("page_start"),
            "page_end": chunk_record.get("page_end"),
            CHUNK_TEXT_FIELD: chunk_value,
            "ocr_content": ocr_text,
            CHUNK_VECTOR_FIELD: chunk_embedding,
            CHUNK_TITLE_VECTOR_FIELD: title_embedding,
            CHUNK_CONTENT_VECTOR_FIELD: content_embedding,
            "document_id": document_id,
            "title": resolved_title,
            "category": resolved_category,
            "owner": resolved_owner,
            "tags": resolved_tags,
            "folder_name": resolved_folder_name,
            "folder_path": resolved_folder_path,
            "folder_breadcrumbs": resolved_folder_breadcrumbs,
            "document_metadata": resolved_document_metadata,
            "metadata_text": resolved_metadata_text,
            "metadata_entries": resolved_metadata_entries,
            "created_at": resolved_created_at,
            "updated_at": now,
        }
        chunk_doc = {key: value for key, value in chunk_doc.items() if value is not None}
        es.index(index=CHUNK_SEARCH_INDEX_NAME, id=chunk_id, body=chunk_doc, refresh=False)
        chunk_count += 1

    if chunk_count:
        es.indices.refresh(index=CHUNK_SEARCH_INDEX_NAME)

    return {
        "document_id": document_id,
        "index": SEARCH_INDEX_NAME,
        "chunk_index": CHUNK_SEARCH_INDEX_NAME,
        "chunk_count": len(chunks),
        "title_embedded": title_embedding is not None,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "chunk_vector_field": CHUNK_VECTOR_FIELD,
        "chunk_title_vector_field": CHUNK_TITLE_VECTOR_FIELD,
        "chunk_content_vector_field": CHUNK_CONTENT_VECTOR_FIELD,
        "updated_at": now,
    }


def _run_embedding_job(job_id: str, request: EmbeddingJobRequest) -> None:
    _update_job(job_id, status="RUNNING", message="Chunking and embedding in progress.", started_at=_utc_now_iso())
    try:
        result = _index_document(request.document_id, request)
        _update_job(
            job_id,
            status="COMPLETED",
            message="Chunking and embedding completed.",
            finished_at=_utc_now_iso(),
            result=result,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Embedding job failed for document %s", request.document_id)
        _update_job(
            job_id,
            status="FAILED",
            message="Chunking and embedding failed.",
            finished_at=_utc_now_iso(),
            error=str(exc),
        )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "search_index": SEARCH_INDEX_NAME,
        "chunk_search_index": CHUNK_SEARCH_INDEX_NAME,
        "embedding_model_path": EMBEDDING_MODEL_PATH,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "chunk_vector_field": CHUNK_VECTOR_FIELD,
        "chunk_title_vector_field": CHUNK_TITLE_VECTOR_FIELD,
        "chunk_content_vector_field": CHUNK_CONTENT_VECTOR_FIELD,
        "job_count": len(_jobs),
    }


@app.post("/embed/jobs", response_model=EmbeddingJobStartResponse)
def create_embedding_job(body: EmbeddingJobRequest, background_tasks: BackgroundTasks) -> EmbeddingJobStartResponse:
    if not clean_text(body.ocr_text):
        raise HTTPException(status_code=400, detail="ocr_text cannot be empty.")

    if not extract_page_entries_from_ocr_response(body.ocr_response_json):
        raise HTTPException(
            status_code=400,
            detail="ocr_response_json must include OCR pages in results with page_no and md_content.",
        )

    job_id = str(uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "QUEUED",
            "message": "Embedding job queued.",
            "created_at": _utc_now_iso(),
            "started_at": None,
            "finished_at": None,
            "result": None,
            "error": None,
        }

    background_tasks.add_task(_run_embedding_job, job_id, body)
    return EmbeddingJobStartResponse(job_id=job_id, status="QUEUED", message="Embedding job queued.")


@app.get("/embed/jobs/{job_id}", response_model=EmbeddingJobStatusResponse)
def get_embedding_job(job_id: str) -> EmbeddingJobStatusResponse:
    try:
        job = _get_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Embedding job not found.") from exc

    return EmbeddingJobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        message=job["message"],
        started_at=job.get("started_at"),
        finished_at=job.get("finished_at"),
        result=job.get("result"),
        error=job.get("error"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("embedding_api:app", host="0.0.0.0", port=int(os.getenv("EMBEDDING_API_PORT", "5101")), reload=True)