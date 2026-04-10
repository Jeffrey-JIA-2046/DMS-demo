"""
DMS Chatbot API
Based on chatbot/AI_search_assistant.py, implemented as a standalone FastAPI service.

Run:
    uvicorn chatbot_api:app --host 0.0.0.0 --port 5100 --reload
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from opensearchpy import OpenSearch, NotFoundError
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("dms-chatbot-api")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPENSEARCH_HOST = os.getenv("CHATBOT_OPENSEARCH_HOST", "localhost")
OPENSEARCH_PORT = int(os.getenv("CHATBOT_OPENSEARCH_PORT", "9200"))
OPENSEARCH_USERNAME = os.getenv("CHATBOT_OPENSEARCH_USERNAME", "admin")
OPENSEARCH_PASSWORD = os.getenv("CHATBOT_OPENSEARCH_PASSWORD", "ASLgemini916")
OPENSEARCH_USE_SSL = os.getenv("CHATBOT_OPENSEARCH_USE_SSL", "true").lower() == "true"
OPENSEARCH_VERIFY_CERTS = os.getenv("CHATBOT_OPENSEARCH_VERIFY_CERTS", "false").lower() == "true"

DEFAULT_SEARCH_INDEX_NAME = "dms-documents-chatbot"
SEARCH_INDEX_NAME = (
    os.getenv("CHATBOT_SEARCH_INDEX_NAME")
    or (os.getenv("SEARCH_INDEX_NAME") if os.getenv("SEARCH_INDEX_NAME") not in {None, "", "dms-documents"} else None)
    or DEFAULT_SEARCH_INDEX_NAME
)
CHAT_LOG_INDEX = os.getenv("CHAT_LOG_INDEX", "chat_logs_dms")
TITLE_VECTOR_FIELD = os.getenv("SEARCH_TITLE_VECTOR_FIELD", "chatbot_title_embedding")
CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")

LLM_API = os.getenv("LLM_API", "http://localhost:11434/api/chat")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-r1:14b")

MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", "5000"))
WARNING_THRESHOLD = int(os.getenv("WARNING_THRESHOLD", "4000"))

_raw_origins = os.getenv("CHATBOT_CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [x.strip() for x in _raw_origins.split(",") if x.strip()]

# Lazy-loaded optional embedding model (SentenceTransformer)
_embedding_model = None

# ---------------------------------------------------------------------------
# App and clients
# ---------------------------------------------------------------------------

app = FastAPI(title="DMS Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
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


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PressRelease(BaseModel):
    title: str
    date: str
    content: str


class SearchRequest(BaseModel):
    q: str = ""
    start_date: str = ""
    end_date: str = ""
    page: int = 1
    per_page: int = 20
    search_mode: str = "hybrid"


class ChatRequest(BaseModel):
    question: str
    chat_id: Optional[str] = None
    press_releases: list[PressRelease] = Field(default_factory=list)
    stream: bool = False


class SummarizeRequest(BaseModel):
    chat_id: Optional[str] = None
    press_releases: list[PressRelease]
    stream: bool = False


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def validate_date_format(date_str: str) -> bool:
    return bool(re.match(r"^\d{4}\d{2}/\d{2}$", date_str))


def convert_to_es_date(date_str: str) -> Optional[str]:
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        return date_obj.strftime("%Y-%m-%d")
    except ValueError:
        return None


def convert_to_es_datetime_start(date_str: str) -> Optional[str]:
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        return date_obj.strftime("%Y-%m-%dT00:00:00")
    except ValueError:
        return None


def convert_to_es_datetime_end(date_str: str) -> Optional[str]:
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        return date_obj.strftime("%Y-%m-%dT23:59:59.999999")
    except ValueError:
        return None


def format_for_display(date_str: str) -> str:
    try:
        if "/" in date_str and len(date_str) == 8:
            date_obj = datetime.strptime(date_str, "%Y%m/%d")
        else:
            normalized = date_str.replace("Z", "+00:00") if isinstance(date_str, str) else date_str
            date_obj = datetime.fromisoformat(normalized)
        return date_obj.strftime("%B %d, %Y")
    except (TypeError, ValueError):
        return date_str


def remove_deepthink(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _count_tokens_approx(messages: list[dict[str, str]]) -> int:
    # Keep behavior resilient without tokenizer dependency.
    return sum(len((msg.get("content") or "")) // 4 for msg in messages)


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model
    model_path = os.getenv("EMBEDDING_MODEL_PATH", "./local_models/multilingual-e5-small")
    try:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(model_path)
        logger.info("Loaded embedding model from %s", model_path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding model unavailable, fallback to text-only search: %s", exc)
        _embedding_model = False
    return _embedding_model


def _get_chatlog_messages(chat_id: str) -> list[dict[str, str]]:
    try:
        response = es.get(index=CHAT_LOG_INDEX, id=chat_id)
        payload = response.get("_source", {}).get("payload", {})
        messages = payload.get("messages", [])
        return messages if isinstance(messages, list) else []
    except NotFoundError:
        return []


def _save_chat_log(chat_id: str, payload: dict[str, Any], assistant_response: str) -> None:
    doc = {
        "chat_id": chat_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload": payload,
        "response": assistant_response,
    }
    es.index(index=CHAT_LOG_INDEX, id=chat_id, body=doc, refresh=True)


# ---------------------------------------------------------------------------
# LLM integration
# ---------------------------------------------------------------------------


def _build_messages(chat_id: Optional[str], user_prompt: str) -> tuple[str, list[dict[str, str]]]:
    resolved_chat_id = chat_id or str(uuid4())
    messages = _get_chatlog_messages(resolved_chat_id)
    messages.append({"role": "user", "content": user_prompt})
    return resolved_chat_id, messages


def _build_llm_payload(messages: list[dict[str, str]], stream: bool) -> dict[str, Any]:
    return {
        "model": LLM_MODEL,
        "stream": stream,
        "think": False,
        "parameters": {
            "temperature": 0.2,
            "top_p": 0.7,
            "max_tokens": 10000,
        },
        "messages": messages,
    }


def _generate_completion(chat_id: Optional[str], user_prompt: str) -> dict[str, Any]:
    resolved_chat_id, messages = _build_messages(chat_id, user_prompt)
    total_tokens = _count_tokens_approx(messages)

    if total_tokens > MAX_CONTEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail={
                "exceed_tokens": "context_length_exceeded",
                "message": "Please start a new session (context too long)",
                "max_tokens": MAX_CONTEXT_LENGTH,
                "current_tokens": total_tokens,
            },
        )

    if total_tokens > WARNING_THRESHOLD:
        logger.warning("Chat %s approaching token limit (%s/%s)", resolved_chat_id, total_tokens, MAX_CONTEXT_LENGTH)

    payload = _build_llm_payload(messages, stream=False)
    response = requests.post(LLM_API, json=payload, headers={"Content-Type": "application/json"}, timeout=90)

    if not response.ok:
        raise HTTPException(status_code=502, detail=f"LLM API error: {response.status_code}")

    body = response.json()
    assistant_response = remove_deepthink(body.get("message", {}).get("content", ""))

    payload["messages"].append({"role": "assistant", "content": assistant_response})
    _save_chat_log(resolved_chat_id, payload, assistant_response)

    return {
        "chat_id": resolved_chat_id,
        "answer": assistant_response,
    }


def _generate_completion_stream(chat_id: Optional[str], user_prompt: str):
    resolved_chat_id, messages = _build_messages(chat_id, user_prompt)
    total_tokens = _count_tokens_approx(messages)

    if total_tokens > MAX_CONTEXT_LENGTH:
        error_obj = {
            "exceed_tokens": "context_length_exceeded",
            "message": "Please start a new session (context too long)",
            "max_tokens": MAX_CONTEXT_LENGTH,
            "current_tokens": total_tokens,
            "complete": True,
        }

        def _error_stream():
            yield f"data: {json.dumps(error_obj)}\n\n"

        return _error_stream()

    payload = _build_llm_payload(messages, stream=True)

    def _event_generator():
        assistant_response = ""
        try:
            response = requests.post(
                LLM_API,
                json=payload,
                headers={"Content-Type": "application/json"},
                stream=True,
                timeout=90,
            )

            if response.status_code != 200:
                yield f"data: {json.dumps({'error': f'LLM API error: {response.status_code}', 'complete': True})}\n\n"
                return

            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                chunk = data.get("message", {}).get("content")
                if not chunk:
                    continue
                assistant_response += chunk
                yield f"data: {json.dumps({'chunk': chunk, 'chat_id': resolved_chat_id, 'complete': False})}\n\n"

            # cleaned = remove_deepthink(assistant_response)
            cleaned = assistant_response.strip()
            payload["messages"].append({"role": "assistant", "content": cleaned})
            _save_chat_log(resolved_chat_id, payload, cleaned)

            yield f"data: {json.dumps({'complete': True, 'chat_id': resolved_chat_id})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'error': str(exc), 'complete': True})}\n\n"

    return _event_generator()


# ---------------------------------------------------------------------------
# OpenSearch search
# ---------------------------------------------------------------------------


def _build_search_body(req: SearchRequest) -> tuple[dict[str, Any], dict[str, str]]:
    query = req.q.strip()
    page = max(1, req.page)
    per_page = req.per_page if req.per_page in {10, 20, 50} else 20
    from_idx = (page - 1) * per_page
    size = per_page
    search_mode = req.search_mode.lower() if req.search_mode else "hybrid"

    date_filter: dict[str, str] = {}
    if req.start_date:
        es_start = convert_to_es_datetime_start(req.start_date)
        if es_start:
            date_filter["gte"] = es_start

    if req.end_date:
        es_end = convert_to_es_datetime_end(req.end_date)
        if es_end:
            date_filter["lte"] = es_end

    body: dict[str, Any] = {
        "from": from_idx,
        "size": size,
        "highlight": {
            "fields": {
                "ocr_content": {},
                "title": {},
            }
        },
    }

    if query:
        # If text search only mode, skip embeddings entirely
        if search_mode == "text":
            if date_filter:
                body["query"] = {
                    "bool": {
                        "must": [{"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}],
                        "filter": [{"range": {"created_at": date_filter}}],
                    }
                }
            else:
                body["query"] = {"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}
            return body, date_filter

        # Hybrid search mode: try embeddings, fallback to text if unavailable
        embedder = _get_embedding_model()
        if embedder is False:
            if date_filter:
                body["query"] = {
                    "bool": {
                        "must": [{"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}],
                        "filter": [{"range": {"created_at": date_filter}}],
                    }
                }
            else:
                body["query"] = {"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}
            return body, date_filter

        query_embedding = embedder.encode(f"query: {query}", normalize_embeddings=True).tolist()
        hybrid_queries = []

        text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}
        if date_filter:
            text_query = {
                "bool": {
                    "must": [{"multi_match": {"query": query, "fields": ["ocr_content", "title"]}}],
                    "filter": [{"range": {"created_at": date_filter}}],
                }
            }
        hybrid_queries.append(text_query)

        title_knn = {"knn": {TITLE_VECTOR_FIELD: {"vector": query_embedding, "k": 50}}}
        if date_filter:
            title_knn["knn"][TITLE_VECTOR_FIELD]["filter"] = {"range": {"created_at": date_filter}}
        hybrid_queries.append(title_knn)

        content_knn = {"knn": {CONTENT_VECTOR_FIELD: {"vector": query_embedding, "k": 50}}}
        if date_filter:
            content_knn["knn"][CONTENT_VECTOR_FIELD]["filter"] = {"range": {"created_at": date_filter}}
        hybrid_queries.append(content_knn)

        body["query"] = {"hybrid": {"queries": hybrid_queries}}
        body["search_pipeline"] = "rrf-pipeline"
        return body, date_filter

    if date_filter:
        body["query"] = {"range": {"created_at": date_filter}}
    else:
        body["query"] = {"match_all": {}}

    return body, date_filter


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.on_event("startup")
def startup() -> None:
    if not es.indices.exists(index=CHAT_LOG_INDEX):
        es.indices.create(
            index=CHAT_LOG_INDEX,
            body={
                "mappings": {
                    "properties": {
                        "chat_id": {"type": "keyword"},
                        "timestamp": {"type": "date"},
                        "payload": {"type": "object"},
                        "response": {"type": "text"},
                    }
                }
            },
        )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "search_index": SEARCH_INDEX_NAME,
        "chat_log_index": CHAT_LOG_INDEX,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "llm_model": LLM_MODEL,
    }


@app.post("/api/chatbot/search")
def search(req: SearchRequest) -> dict[str, Any]:
    try:
        body, date_filter = _build_search_body(req)
        try:
            res = es.search(index=SEARCH_INDEX_NAME, body=body)
        except Exception as search_exc:  # noqa: BLE001
            if (req.search_mode or "").lower() == "hybrid":
                logger.warning("Hybrid query failed, falling back to text search: %s", search_exc)
                fallback_req = SearchRequest(
                    q=req.q,
                    start_date=req.start_date,
                    end_date=req.end_date,
                    page=req.page,
                    per_page=req.per_page,
                    search_mode="text",
                )
                body, date_filter = _build_search_body(fallback_req)
                res = es.search(index=SEARCH_INDEX_NAME, body=body)
            else:
                raise

        hits_obj = res.get("hits", {})
        hits = hits_obj.get("hits", [])
        total_obj = hits_obj.get("total", 0)
        total = total_obj.get("value", 0) if isinstance(total_obj, dict) else int(total_obj or 0)

        page = max(1, req.page)
        per_page = req.per_page if req.per_page in {10, 20, 50} else 20
        page_hits = hits

        results = []
        for hit in page_hits:
            source = hit.get("_source", {})
            item = {
                "id": hit.get("_id"),
                "score": hit.get("_score"),
                "source": source,
                "highlight": hit.get("highlight", {}),
            }
            if "created_at" in source:
                item["source"]["formatted_date"] = format_for_display(source.get("created_at"))
            if "updated_at" in source:
                item["source"]["formatted_updated_at"] = format_for_display(source.get("updated_at"))
            results.append(item)

        total_pages = (total + per_page - 1) // per_page if total > 0 else 1

        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
            "results": results,
            "debug": {
                "original_hits": len(hits),
                "filtered_hits": len(hits),
                "date_filter_applied": bool(date_filter),
            },
        }

    except NotFoundError:
        raise HTTPException(status_code=404, detail="Index not found")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc


@app.post("/api/chatbot/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Missing question")

    if req.press_releases and len(req.press_releases) > 3:
        raise HTTPException(status_code=400, detail="Please select 1-3 press releases")

    if req.press_releases:
        combined = "\n\n---\n\n".join(
            [f"Title: {pr.title}\nDate: {pr.date}\nContent: {pr.content}" for pr in req.press_releases]
        )
        user_prompt = (
            f"你是一位贴心的助手，解答关于这份文件的所有疑问。问题：{req.question}\n"
            f"以下是这份文件的内容：\n\n{combined}"
        )
    else:
        user_prompt = (
            "你是一位贴心的助手，请根据上下文内容回答。"
            "不要回答与上下文主题不相关的问题，使用问题的语言进行回答。"
            f"以下是我的问题：{req.question}"
        )

    if req.stream:
        generator = _generate_completion_stream(req.chat_id, user_prompt)
        return StreamingResponse(generator, media_type="text/event-stream")

    return _generate_completion(req.chat_id, user_prompt)


@app.post("/api/chatbot/summarize-multiple")
def summarize_multiple(req: SummarizeRequest):
    if not req.press_releases or len(req.press_releases) > 3:
        raise HTTPException(status_code=400, detail="Please select 1-3 press releases")

    combined = "\n\n---\n\n".join(
        [f"Title: {pr.title}\nDate: {pr.date}\nContent: {pr.content}" for pr in req.press_releases]
    )

    user_prompt = (
        "你是一位贴心的助手，解答关于这份文件的所有疑问。"
        f"请列出文件标题，比较并总结这 {len(req.press_releases)} 篇文件，"
        f"\n\n{combined}"
    )

    if req.stream:
        generator = _generate_completion_stream(req.chat_id, user_prompt)
        return StreamingResponse(generator, media_type="text/event-stream")

    result = _generate_completion(req.chat_id, user_prompt)
    return {"chat_id": result["chat_id"], "summary": result["answer"]}


@app.get("/api/chatbot/chats/{chat_id}")
def get_chat(chat_id: str) -> dict[str, Any]:
    return {
        "chat_id": chat_id,
        "messages": _get_chatlog_messages(chat_id),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("chatbot_api:app", host="0.0.0.0", port=int(os.getenv("CHATBOT_API_PORT", "5100")), reload=True)
