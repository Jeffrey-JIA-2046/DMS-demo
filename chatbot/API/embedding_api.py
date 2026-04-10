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
EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH", "./local_models/multilingual-e5-small")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))
MAX_CHUNK_SIZE = int(os.getenv("EMBEDDING_MAX_CHUNK_SIZE", "250"))
TITLE_VECTOR_FIELD = os.getenv("SEARCH_TITLE_VECTOR_FIELD", "chatbot_title_embedding")
CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")
CHUNKS_FIELD = os.getenv("SEARCH_CHUNKS_FIELD", "chatbot_ocr_content_chunks")

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
    ocr_text: str = Field(min_length=1)
    category: Optional[str] = None
    owner: Optional[str] = None
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
                "title": {"type": "text"},
                "ocr_content": {"type": "text"},
                "category": {"type": "keyword"},
                "owner": {"type": "keyword"},
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


def ensure_search_index() -> None:
    if not es.indices.exists(index=SEARCH_INDEX_NAME):
        es.indices.create(index=SEARCH_INDEX_NAME, body=_default_index_body())
        logger.info("Created search index %s", SEARCH_INDEX_NAME)
        return

    try:
        es.indices.put_settings(index=SEARCH_INDEX_NAME, body={"index": {"knn": True}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to update index settings for %s: %s", SEARCH_INDEX_NAME, exc)

    try:
        es.indices.put_mapping(index=SEARCH_INDEX_NAME, body=_default_index_body()["mappings"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to update index mapping for %s: %s", SEARCH_INDEX_NAME, exc)


def _load_existing_document(document_id: str) -> dict[str, Any]:
    try:
        response = es.get(index=SEARCH_INDEX_NAME, id=document_id)
        return dict(response.get("_source", {}))
    except NotFoundError:
        return {}


def _index_document(document_id: str, request: EmbeddingJobRequest) -> dict[str, Any]:
    ensure_search_index()

    title = clean_text(request.title)
    ocr_text = clean_text(request.ocr_text)
    if not ocr_text:
        raise ValueError("OCR text is empty after cleaning")

    chunks = chunk_text(ocr_text)
    if not chunks:
        chunks = [ocr_text]

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
        "ocr_content": ocr_text,
        "category": request.category if request.category is not None else existing.get("category"),
        "owner": request.owner if request.owner is not None else existing.get("owner"),
        "created_at": request.created_at or existing.get("created_at") or now,
        "updated_at": now,
        CONTENT_VECTOR_FIELD: content_embedding,
        CHUNKS_FIELD: [
            {"text": chunk, "embedding": embedding}
            for chunk, embedding in zip(chunks, chunk_embeddings)
        ],
    }
    if title_embedding is not None:
        payload[TITLE_VECTOR_FIELD] = title_embedding

    payload = {key: value for key, value in payload.items() if value is not None}
    es.index(index=SEARCH_INDEX_NAME, id=document_id, body=payload, refresh=True)

    return {
        "document_id": document_id,
        "index": SEARCH_INDEX_NAME,
        "chunk_count": len(chunks),
        "title_embedded": title_embedding is not None,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
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
        "embedding_model_path": EMBEDDING_MODEL_PATH,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "job_count": len(_jobs),
    }


@app.post("/embed/jobs", response_model=EmbeddingJobStartResponse)
def create_embedding_job(body: EmbeddingJobRequest, background_tasks: BackgroundTasks) -> EmbeddingJobStartResponse:
    if not clean_text(body.ocr_text):
        raise HTTPException(status_code=400, detail="ocr_text cannot be empty.")

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