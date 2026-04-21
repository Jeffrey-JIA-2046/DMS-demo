"""
DMS Chatbot API
Based on chatbot/AI_search_assistant.py, implemented as a standalone FastAPI service.
Extended with multi‑agent task classification and routing.

Run:
    uvicorn chatbot_agent_api:app --host 0.0.0.0 --port 5100 --reload
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4
from enum import Enum
from copy import deepcopy

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
CLASSIFIER_TIMEOUT_SECONDS = int(os.getenv("CHATBOT_CLASSIFIER_TIMEOUT_SECONDS", "20"))

MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", "5000"))
WARNING_THRESHOLD = int(os.getenv("WARNING_THRESHOLD", "4000"))
VERBOSE_LOGS = os.getenv("CHATBOT_VERBOSE_LOGS", "true").lower() == "true"

_raw_origins = os.getenv("CHATBOT_CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [x.strip() for x in _raw_origins.split(",") if x.strip()]

# Lazy-loaded optional embedding model
_embedding_model = None


def _truncate_for_log(value: Any, max_length: int = 1200) -> str:
    try:
        if isinstance(value, str):
            rendered = value
        else:
            rendered = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:  # noqa: BLE001
        rendered = repr(value)
    if len(rendered) <= max_length:
        return rendered
    return f"{rendered[:max_length]}... [truncated {len(rendered) - max_length} chars]"


def _preview_text(value: Any, max_length: int = 240) -> str:
    if value is None:
        return ""
    text = value if isinstance(value, str) else str(value)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def _summarize_messages_for_log(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary = []
    for message in messages:
        summary.append(
            {
                "role": message.get("role"),
                "content_preview": _preview_text(message.get("content", "")),
                "content_length": len(message.get("content", "") or ""),
            }
        )
    return summary


def _summarize_llm_payload_for_log(payload: dict[str, Any]) -> dict[str, Any]:
    messages = payload.get("messages", [])
    return {
        "model": payload.get("model"),
        "stream": payload.get("stream"),
        "think": payload.get("think"),
        "parameters": payload.get("parameters", {}),
        "message_count": len(messages),
        "messages": _summarize_messages_for_log(messages),
    }


def _summarize_search_body_for_log(body: dict[str, Any]) -> dict[str, Any]:
    summary = {
        "from": body.get("from"),
        "size": body.get("size"),
        "highlight_fields": sorted((body.get("highlight", {}) or {}).get("fields", {}).keys()),
    }
    query_obj = body.get("query", {}) or {}
    if "hybrid" in query_obj:
        hybrid = query_obj.get("hybrid", {}) or {}
        query_summaries: list[dict[str, Any]] = []
        for item in hybrid.get("queries", []):
            if "multi_match" in item:
                multi = item.get("multi_match", {}) or {}
                query_summaries.append(
                    {
                        "type": "multi_match",
                        "query": _preview_text(multi.get("query", ""), 120),
                        "fields": multi.get("fields", []),
                    }
                )
            elif "knn" in item:
                knn = item.get("knn", {}) or {}
                for field_name, field_payload in knn.items():
                    vector = field_payload.get("vector", []) or []
                    query_summaries.append(
                        {
                            "type": "knn",
                            "field": field_name,
                            "k": field_payload.get("k"),
                            "vector_dims": len(vector),
                        }
                    )
            else:
                query_summaries.append({"type": "other", "keys": sorted(item.keys())})
        summary["query"] = {"type": "hybrid", "queries": query_summaries}
    else:
        summary["query"] = {"type": sorted(query_obj.keys())}
    return summary


def _summarize_provider_response_for_log(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": payload.get("model"),
        "done": payload.get("done"),
        "done_reason": payload.get("done_reason"),
        "content_preview": _preview_text((payload.get("message", {}) or {}).get("content", "")),
        "prompt_eval_count": payload.get("prompt_eval_count"),
        "eval_count": payload.get("eval_count"),
        "total_duration": payload.get("total_duration"),
    }


def _log_verbose(message: str, payload: Any | None = None) -> None:
    if not VERBOSE_LOGS:
        return
    if payload is None:
        logger.info(message)
        return
    logger.info("%s | %s", message, _truncate_for_log(payload))


def _log_workflow_step(step: int, title: str, payload: Any | None = None, verbose_only: bool = False) -> None:
    message = f"Step {step}: {title}"
    if verbose_only:
        _log_verbose(message, payload)
        return
    if payload is None:
        logger.info(message)
        return
    logger.info("%s | %s", message, _truncate_for_log(payload))

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
    owners: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    folder_names: list[str] = Field(default_factory=list)
    folder_paths: list[str] = Field(default_factory=list)
    metadata_filters: dict[str, str] = Field(default_factory=dict)

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
# Multi‑agent classification & routing
# ---------------------------------------------------------------------------

class IntentType(str, Enum):
    KEYWORD_SEARCH = "keyword_search"
    SEMANTIC_SEARCH = "semantic_search"
    STATS_COUNT = "stats_count"
    SINGLE_DOC_SUMMARY = "single_doc_summary"
    MIXED_SEARCH_SUMMARY = "mixed_search_summary"
    GENERAL_RAG_QA = "general_rag_qa"

class IntentResult(BaseModel):
    intent: IntentType
    parameters: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0
    classification_source: str = "llm"


KEYWORD_MATCH_MODES = {"exact_phrase", "all_terms", "any_terms"}


CLASSIFIER_SYSTEM_PROMPT = (
    "You are an intent planner for a document-management chatbot. "
    "Classify the user's request into the best task type and extract routing parameters. "
    "Prefer semantic retrieval for natural language questions. "
    "Use keyword_search only when the user clearly requires literal or exact matching. "
    "Use general_rag_qa for normal question answering that should retrieve relevant documents first."
)


def _classification_debug_payload(question: str, result: IntentResult) -> dict[str, Any]:
    return {
        "question": question,
        "intent": result.intent.value,
        "confidence": result.confidence,
        "classification_source": result.classification_source,
        "parameters": result.parameters,
    }


def _log_classification_result(question: str, result: IntentResult) -> None:
    payload = _classification_debug_payload(question, result)
    _log_workflow_step(2, "Task classification result", payload)


RAG_SYSTEM_PROMPT = (
    "You are a retrieval-augmented assistant for a document management system. "
    "Always answer using the retrieved document context. "
    "If the retrieved context is insufficient, explicitly say you cannot find enough evidence in the documents. "
    "When possible, mention the most relevant document titles or IDs that support the answer."
)


MONTH_NAME_TO_NUMBER = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

# ---------------------------------------------------------------------------
# Specialist agents
# ---------------------------------------------------------------------------

class KeywordSearchAgent:
    @staticmethod
    async def execute(question: str, filters: dict = None, parameters: dict[str, Any] | None = None) -> dict:
        params = parameters or {}
        _log_verbose("KeywordSearchAgent.execute invoked", {"question": question, "parameters": params, "filters": filters or {}})
        effective_filters = dict(filters or {})
        effective_filters.update(params.get("filters", {}))
        page = 1
        per_page = 10

        if params.get("exact_phrase") or params.get("must_terms") or params.get("should_terms"):
            must_clauses: list[dict[str, Any]] = []
            should_clauses: list[dict[str, Any]] = []
            text_fields = ["ocr_content", "title", "description", "metadata_text", "folder_name", "folder_path"]

            exact_phrase = params.get("exact_phrase")
            match_mode = params.get("match_mode")
            if match_mode == "exact_phrase" and exact_phrase:
                must_clauses.append(
                    {
                        "multi_match": {
                            "query": exact_phrase,
                            "fields": text_fields,
                            "type": "phrase",
                        }
                    }
                )

            elif match_mode == "all_terms":
                for term in params.get("must_terms", []):
                    must_clauses.append(
                        {
                            "multi_match": {
                                "query": term,
                                "fields": text_fields,
                                "operator": "and",
                            }
                        }
                    )
            elif match_mode == "any_terms":
                for term in params.get("should_terms", []):
                    should_clauses.append(
                        {
                            "multi_match": {
                                "query": term,
                                "fields": text_fields,
                                "operator": "and",
                            }
                        }
                    )

            if not must_clauses and not should_clauses:
                must_clauses.append(
                    {
                        "multi_match": {
                            "query": params.get("query") or question,
                            "fields": text_fields,
                        }
                    }
                )

            body: dict[str, Any] = {
                "from": 0,
                "size": per_page,
                "highlight": {
                    "fields": {
                        "ocr_content": {},
                        "title": {},
                        "description": {},
                        "metadata_text": {},
                        "folder_path": {},
                    }
                },
                "query": {
                    "bool": {
                        "must": must_clauses,
                    }
                },
            }
            if should_clauses:
                body["query"]["bool"]["should"] = should_clauses
                body["query"]["bool"]["minimum_should_match"] = 1
                if not must_clauses:
                    body["query"]["bool"].pop("must", None)
            filter_clauses = _build_filter_clauses(SearchRequest(**effective_filters), {}) if effective_filters else []
            if filter_clauses:
                body["query"]["bool"]["filter"] = filter_clauses
            result = _execute_raw_search(body, page, per_page)
        else:
            req = SearchRequest(
                q=params.get("query") or question,
                search_mode="text",
                page=page,
                per_page=per_page,
                **effective_filters,
            )
            result = _execute_search(req)
        return {
            "intent": "keyword_search",
            "results": result.get("results", []),
            "total": result.get("total", 0),
            "parameters": params,
        }

class SemanticSearchAgent:
    @staticmethod
    async def execute(question: str, filters: dict = None, parameters: dict[str, Any] | None = None) -> dict:
        params = parameters or {}
        _log_verbose("SemanticSearchAgent.execute invoked", {"question": question, "parameters": params, "filters": filters or {}})
        effective_filters = dict(filters or {})
        effective_filters.update(params.get("filters", {}))
        req = SearchRequest(
            q=params.get("query") or question,
            search_mode="hybrid",
            page=1,
            per_page=10,
            **effective_filters,
        )
        result = _execute_search(req)
        return {
            "intent": "semantic_search",
            "results": result.get("results", []),
            "total": result.get("total", 0),
            "parameters": params,
        }

class StatsAgent:
    @staticmethod
    async def execute(question: str, parameters: dict[str, Any] | None = None) -> dict:
        params = parameters or {}
        _log_verbose("StatsAgent.execute invoked", {"question": question, "parameters": params})
        date_info = params.get("date_range") or extract_date_range_from_question(question)
        if not date_info:
            return {"error": "Could not parse date range from question", "count": 0}

        topic = params.get("topic") or extract_topic_from_question(question)
        body = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {
                            "range": {
                                "created_at": {
                                    "gte": date_info["start_date"],
                                    "lte": date_info["end_date"],
                                }
                            }
                        },
                    ]
                }
            }
        }
        if topic:
            body["query"]["bool"]["must"].append(
                {
                    "multi_match": {
                        "query": topic,
                        "fields": ["folder_name^3", "title^2", "description", "metadata_text", "ocr_content"],
                    }
                }
            )
        try:
            res = es.search(index=SEARCH_INDEX_NAME, body=body)
            total = res["hits"]["total"]["value"]
            return {
                "count": total,
                "date_range": f"{date_info['start_date']} to {date_info['end_date']}",
                "topic": topic,
            }
        except Exception as e:
            return {"error": str(e), "count": 0}

class SingleDocSummaryAgent:
    @staticmethod
    async def execute(doc_id: str) -> dict:
        try:
            _log_verbose("SingleDocSummaryAgent fetching document", {"doc_id": doc_id, "index": SEARCH_INDEX_NAME})
            doc = es.get(index=SEARCH_INDEX_NAME, id=doc_id)
            source = doc["_source"]
            content = source.get("ocr_content", "") or source.get("content", "") or source.get("description", "")
            title = source.get("title", "Untitled")
            summary_prompt = f"Please provide a brief summary (2-3 sentences) of the following document:\nTitle: {title}\n\nContent: {content[:3000]}"
            result = _generate_completion(None, summary_prompt)
            summary = result["answer"]
            return {
                "doc_id": doc_id,
                "title": title,
                "summary": summary,
                "source": source
            }
        except NotFoundError:
            return {"error": f"Document {doc_id} not found"}

class MixedSearchSummaryAgent:
    @staticmethod
    async def execute(question: str, parameters: dict[str, Any] | None = None, top_k: int = 5) -> dict:
        _log_verbose("MixedSearchSummaryAgent.execute invoked", {"question": question, "parameters": parameters or {}, "top_k": top_k})
        search_result = await SemanticSearchAgent.execute(question, parameters=parameters)
        results = search_result.get("results", [])[:top_k]
        if not results:
            return {"error": "No relevant documents found", "summary": ""}
        docs_text = []
        for idx, res in enumerate(results, 1):
            src = res.get("source", {})
            title = src.get("title", "Untitled")
            content = src.get("ocr_content", "") or src.get("content", "") or src.get("description", "")
            content = content[:1000]
            docs_text.append(f"Document {idx}:\nTitle: {title}\nContent: {content}\n")
        combined = "\n---\n".join(docs_text)
        summary_prompt = (
            f"Based on the following {len(results)} documents, please list the most relevant ones and briefly summarize their key points.\n\n"
            f"{combined}\n\n"
            f"Output format: For each document, provide a short bullet point summary."
        )
        summary_result = _generate_completion(None, summary_prompt)
        return {
            "search_results": results,
            "summary": summary_result["answer"]
        }


class RagAnswerAgent:
    @staticmethod
    async def execute(question: str, chat_id: Optional[str], parameters: dict[str, Any] | None = None, top_k: int = 5) -> dict:
        # Step 4: retrieve the most relevant documents for grounded answering.
        params = parameters or {}
        _log_verbose("RagAnswerAgent.execute invoked", {"question": question, "chat_id": chat_id, "parameters": params, "top_k": top_k})
        search_result = await SemanticSearchAgent.execute(question, parameters=params)
        results = search_result.get("results", [])[:top_k]
        if not results:
            return {
                "answer": "I could not find relevant documents to answer this question.",
                "search_results": [],
                "sources": [],
                "token_usage": {},
            }

        context = _build_rag_context(results)
        rag_prompt = (
            f"User question: {question}\n\n"
            "Retrieved document context:\n"
            f"{context}\n\n"
            "Answer the question using only the context above. "
            "If the answer is incomplete or uncertain, say what is missing."
        )
        _log_workflow_step(
            4,
            "RAG retrieved documents",
            {
                "question": question,
                "doc_count": len(results),
                "docs": [_summarize_result_for_log(item) for item in results],
                "rag_prompt_preview": rag_prompt,
            },
            verbose_only=True,
        )
        completion = _generate_completion(chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        return {
            "answer": completion["answer"],
            "search_results": results,
            "sources": [_summarize_result_for_log(item) for item in results],
            "token_usage": completion.get("token_usage", {}),
        }


def _stream_text_response(answer: str, chat_id: str, intent: IntentType, extra_meta: Optional[dict[str, Any]] = None):
    def _generator():
        for idx in range(0, len(answer), 50):
            yield f"data: {json.dumps({'chunk': answer[idx:idx+50], 'chat_id': chat_id, 'complete': False})}\n\n"
        final_payload = {"complete": True, "chat_id": chat_id, "intent": intent.value}
        if extra_meta:
            final_payload.update(extra_meta)
        yield f"data: {json.dumps(final_payload)}\n\n"

    return _generator()


def _wrap_stream_with_metadata(generator, intent: IntentType, extra_meta: Optional[dict[str, Any]] = None):
    def _wrapped():
        for event in generator:
            if not isinstance(event, str) or not event.startswith("data:"):
                yield event
                continue

            payload_text = event[5:].strip()
            if not payload_text:
                yield event
                continue

            try:
                payload = json.loads(payload_text)
            except json.JSONDecodeError:
                yield event
                continue

            if payload.get("complete"):
                payload["intent"] = intent.value
                if extra_meta:
                    payload.update(extra_meta)

            yield f"data: {json.dumps(payload)}\n\n"

    return _wrapped()


async def _build_agent_stream(question: str, chat_id: Optional[str], intent_result: IntentResult):
    intent = intent_result.intent
    params = intent_result.parameters
    resolved_chat_id = chat_id or str(uuid4())
    classification_meta = {"classification": _classification_debug_payload(question, intent_result)}
    _log_verbose(
        "_build_agent_stream start",
        {"question": question, "chat_id": chat_id, "resolved_chat_id": resolved_chat_id, "intent": intent.value, "parameters": params},
    )

    if intent == IntentType.GENERAL_RAG_QA:
        search_result = await SemanticSearchAgent.execute(question, parameters=params)
        results = search_result.get("results", [])[:5]
        if not results:
            return _stream_text_response(
                "I could not find relevant documents to answer this question.",
                resolved_chat_id,
                intent,
                classification_meta,
            )

        context = _build_rag_context(results)
        rag_prompt = (
            f"User question: {question}\n\n"
            "Retrieved document context:\n"
            f"{context}\n\n"
            "Answer the question using only the context above. "
            "If the answer is incomplete or uncertain, say what is missing."
        )
        _log_verbose(
            "_build_agent_stream RAG documents",
            {"question": question, "doc_count": len(results), "docs": [_summarize_result_for_log(item) for item in results]},
        )
        generator = _generate_completion_stream(resolved_chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        return _wrap_stream_with_metadata(generator, intent, {"sources": [_summarize_result_for_log(item) for item in results], **classification_meta})

    if intent == IntentType.SINGLE_DOC_SUMMARY:
        doc_id = params.get("doc_id")
        if not doc_id:
            return _stream_text_response(
                "Could not identify a document ID. Please provide a valid document ID.",
                resolved_chat_id,
                intent,
                classification_meta,
            )
        try:
            doc = es.get(index=SEARCH_INDEX_NAME, id=doc_id)
            source = doc["_source"]
        except NotFoundError:
            return _stream_text_response(f"Document {doc_id} not found.", resolved_chat_id, intent, classification_meta)

        content = source.get("ocr_content", "") or source.get("content", "") or source.get("description", "")
        title = source.get("title", "Untitled")
        summary_prompt = f"Please provide a brief summary (2-3 sentences) of the following document:\nTitle: {title}\n\nContent: {content[:3000]}"
        generator = _generate_completion_stream(resolved_chat_id, summary_prompt)
        return _wrap_stream_with_metadata(generator, intent, {"doc_id": doc_id, "title": title, **classification_meta})

    if intent == IntentType.MIXED_SEARCH_SUMMARY:
        search_result = await SemanticSearchAgent.execute(question, parameters=params)
        results = search_result.get("results", [])[:5]
        if not results:
            return _stream_text_response("No relevant documents found.", resolved_chat_id, intent, classification_meta)

        docs_text = []
        for idx, res in enumerate(results, 1):
            src = res.get("source", {})
            title = src.get("title", "Untitled")
            content = src.get("ocr_content", "") or src.get("content", "") or src.get("description", "")
            docs_text.append(f"Document {idx}:\nTitle: {title}\nContent: {content[:1000]}\n")
        summary_prompt = (
            f"Based on the following {len(results)} documents, please list the most relevant ones and briefly summarize their key points.\n\n"
            f"{'\n---\n'.join(docs_text)}\n\n"
            "Output format: For each document, provide a short bullet point summary."
        )
        generator = _generate_completion_stream(resolved_chat_id, summary_prompt)
        return _wrap_stream_with_metadata(generator, intent, {"sources": [_summarize_result_for_log(item) for item in results], **classification_meta})

    result = await orchestrate_agent_chat(question, resolved_chat_id)
    _log_verbose("_build_agent_stream fallback response", result)
    return _stream_text_response(result["answer"], result["chat_id"], intent, classification_meta)

def extract_date_range_from_question(question: str) -> dict[str, str] | None:
    month_year_match = re.search(
        r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
        question,
        re.IGNORECASE,
    )
    if month_year_match:
        month_name = month_year_match.group(1).lower()
        year_str = month_year_match.group(2)
        month_num = MONTH_NAME_TO_NUMBER[month_name]
    else:
        iso_match = re.search(r'(\d{4})-(\d{2})', question)
        if not iso_match:
            return None
        year_str = iso_match.group(1)
        month_num = int(iso_match.group(2))

    from calendar import monthrange

    last_day = monthrange(int(year_str), month_num)[1]
    return {
        "start_date": f"{year_str}-{month_num:02d}-01",
        "end_date": f"{year_str}-{month_num:02d}-{last_day:02d}",
    }


def extract_topic_from_question(question: str) -> str | None:
    relating_match = re.search(r'relating to\s+(.+?)\s+in\s+(January|February|March|April|May|June|July|August|September|October|November|December|\d{4}-\d{2})', question, re.IGNORECASE)
    if relating_match:
        return relating_match.group(1).strip(" .")

    if re.search(r'bills committee meeting', question, re.IGNORECASE):
        return 'Bills Committee Meeting'

    return None


def build_search_parameters(question: str) -> dict[str, Any]:
    # Let the LLM decide whether the query implies exact phrase, AND-term, or OR-term matching.
    exact_phrase = None
    must_terms: list[str] = []
    should_terms: list[str] = []
    date_range = extract_date_range_from_question(question)
    topic = extract_topic_from_question(question)
    filters: dict[str, Any] = {}

    query = question.strip()

    return {
        "query": query,
        "exact_phrase": exact_phrase,
        "must_terms": must_terms,
        "should_terms": should_terms,
        "date_range": date_range,
        "topic": topic,
        "filters": filters,
        "search_mode": "hybrid",
        "match_mode": None,
        "requires_exact_match": False,
        "requires_summary": False,
    }


def _merge_classifier_parameters(base_parameters: dict[str, Any], classifier_payload: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base_parameters)

    if classifier_payload.get("phrase"):
        merged["exact_phrase"] = str(classifier_payload["phrase"]).strip()
    if classifier_payload.get("must_terms"):
        merged["must_terms"] = [str(term).strip() for term in classifier_payload.get("must_terms", []) if str(term).strip()]
    if classifier_payload.get("should_terms"):
        merged["should_terms"] = [str(term).strip() for term in classifier_payload.get("should_terms", []) if str(term).strip()]
    if classifier_payload.get("topic"):
        merged["topic"] = str(classifier_payload["topic"]).strip()
    if classifier_payload.get("doc_id"):
        merged["doc_id"] = str(classifier_payload["doc_id"]).strip()
    if classifier_payload.get("date_range"):
        merged["date_range"] = classifier_payload["date_range"]

    if "search_mode" in classifier_payload and classifier_payload["search_mode"] in {"text", "hybrid"}:
        merged["search_mode"] = classifier_payload["search_mode"]
    if classifier_payload.get("match_mode") in KEYWORD_MATCH_MODES:
        merged["match_mode"] = classifier_payload["match_mode"]
    if "requires_exact_match" in classifier_payload:
        merged["requires_exact_match"] = bool(classifier_payload["requires_exact_match"])
    if "requires_summary" in classifier_payload:
        merged["requires_summary"] = bool(classifier_payload["requires_summary"])

    if merged.get("match_mode") == "exact_phrase" and classifier_payload.get("phrase"):
        merged["exact_phrase"] = str(classifier_payload["phrase"]).strip()
        merged["must_terms"] = []
        merged["should_terms"] = []
        merged["requires_exact_match"] = True
    else:
        merged["exact_phrase"] = None
        merged["requires_exact_match"] = False

    if merged.get("match_mode") == "all_terms":
        merged["should_terms"] = []
    elif merged.get("match_mode") == "any_terms":
        merged["must_terms"] = []

    if merged.get("must_terms") and merged.get("match_mode") == "all_terms":
        merged["query"] = " ".join(merged["must_terms"])
    elif merged.get("should_terms") and merged.get("match_mode") == "any_terms":
        merged["query"] = " OR ".join(merged["should_terms"])
    elif merged.get("exact_phrase"):
        merged["query"] = merged["exact_phrase"]

    return merged


def _classify_intent_with_llm(question: str, base_parameters: dict[str, Any]) -> IntentResult | None:
    classification_prompt = f"""Return JSON only.

Available intents:
- keyword_search: literal or exact matching request.
- semantic_search: similar case lookup or semantic retrieval.
- stats_count: counting documents with date/topic constraints.

- mixed_search_summary: retrieve multiple relevant documents and summarize them.
- general_rag_qa: answer a question by retrieving relevant documents first.

User question:
{question}

Hint parameters already extracted from the question:
{json.dumps(base_parameters, ensure_ascii=False)}

Rules:
- Do not rely on quoted text alone to infer exact phrase matching.
- Choose a keyword match mode only when the user clearly wants literal keyword filtering.
- If the user wants documents containing term A and term B, use match_mode="all_terms" and return must_terms.
- If the user wants documents containing term A or term B, use match_mode="any_terms" and return should_terms.
- Only use match_mode="exact_phrase" and phrase when the user clearly asks for an exact phrase or literal adjacency match.
- Do not choose keyword_search unless exact or literal matching is clearly needed.
- Prefer general_rag_qa for normal questions that should be answered from retrieved documents.
- Prefer semantic_search for "similar case", "find a case", "locate a case" style requests.
- Prefer mixed_search_summary when the user wants relevant documents plus a brief summary of key points.


Examples:
- Query: documents containing "金融" and "貨幣"
    Return: match_mode="all_terms", must_terms=["金融", "貨幣"], should_terms=[], phrase=null
- Query: documents containing 金融 or 花園
    Return: match_mode="any_terms", must_terms=[], should_terms=["金融", "花園"], phrase=null
- Query: documents containing the exact phrase "金融 貨幣"
    Return: match_mode="exact_phrase", phrase="金融 貨幣", must_terms=[], should_terms=[]



Response schema:
{{
  "intent": "keyword_search|semantic_search|stats_count|single_doc_summary|mixed_search_summary|general_rag_qa",
  "confidence": 0.0,
  "search_mode": "text|hybrid",
    "match_mode": "exact_phrase|all_terms|any_terms|null",
  "requires_exact_match": false,
  "requires_summary": false,
  "doc_id": null,
  "date_range": null,
  "topic": null,
  "must_terms": [],
    "should_terms": [],
  "phrase": null
}}"""

        # The LLM is responsible for deciding whether a doc_id exists; avoid regex shortcuts.
    response = requests.post(
        LLM_API,
        json={
            "model": LLM_MODEL,
            "stream": False,
            "think": False,
            "messages": [
                {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                {"role": "user", "content": classification_prompt},
            ],
            "parameters": {"temperature": 0},
        },
        timeout=CLASSIFIER_TIMEOUT_SECONDS,
    )
    if not response.ok:
        logger.warning("Intent classifier LLM returned HTTP %s", response.status_code)
        return None

    data = response.json()
    _log_verbose("Intent classifier raw response", _summarize_provider_response_for_log(data))
    content = data.get("message", {}).get("content", "")
    content = re.sub(r'```json\s*|\s*```', '', content.strip())
    classifier_payload = json.loads(content)
    intent_value = classifier_payload.get("intent", IntentType.GENERAL_RAG_QA.value)
    merged_parameters = _merge_classifier_parameters(base_parameters, classifier_payload)
    confidence = float(classifier_payload.get("confidence", 0.8))
    return IntentResult(
        intent=IntentType(intent_value),
        parameters=merged_parameters,
        confidence=confidence,
        classification_source="llm",
    )


def _summarize_result_for_log(result: dict[str, Any]) -> dict[str, Any]:
    source = result.get("source", {})
    return {
        "id": result.get("id"),
        "score": result.get("score"),
        "title": source.get("title", "Untitled"),
        "folder_name": source.get("folder_name", ""),
        "folder_path": source.get("folder_path", ""),
        "created_at": source.get("created_at", ""),
    }


def _build_rag_context(results: list[dict[str, Any]], max_chars_per_doc: int = 1200) -> str:
    sections: list[str] = []
    for index, item in enumerate(results, start=1):
        source = item.get("source", {})
        title = source.get("title", "Untitled")
        doc_id = item.get("id", "")
        score = item.get("score")
        folder_name = source.get("folder_name", "")
        folder_path = source.get("folder_path", "")
        created_at = source.get("created_at", "")
        content = source.get("ocr_content", "") or source.get("content", "") or source.get("description", "") or source.get("metadata_text", "")
        content = (content or "")[:max_chars_per_doc]
        sections.append(
            "\n".join(
                [
                    f"Document {index}",
                    f"ID: {doc_id}",
                    f"Title: {title}",
                    f"Score: {score}",
                    f"Folder Name: {folder_name}",
                    f"Folder Path: {folder_path}",
                    f"Created At: {created_at}",
                    f"Content: {content}",
                ]
            )
        )
    return "\n\n---\n\n".join(sections)

# ---------------------------------------------------------------------------
# Intent classifier agent
# ---------------------------------------------------------------------------

class IntentClassifier:
    @staticmethod
    def classify(question: str) -> IntentResult:
        # Step 2: classify the user question into the best backend task.
        parameters = build_search_parameters(question)
        _log_verbose("Step 2 input: IntentClassifier.classify", {"question": question, "parameters": parameters})

        try:
            intent_result = _classify_intent_with_llm(question, parameters)
            if intent_result is not None:
                _log_classification_result(question, intent_result)
                return intent_result
        except Exception as e:
            logger.warning(f"Intent classifier LLM failed: {e}, falling back to general_rag_qa")

        result = IntentResult(
            intent=IntentType.GENERAL_RAG_QA,
            parameters=parameters,
            classification_source="fallback_general_rag_qa",
        )
        _log_classification_result(question, result)
        return result

# ---------------------------------------------------------------------------
# Refactored internal search (reused from original /search endpoint)
# ---------------------------------------------------------------------------

def _execute_search(req: SearchRequest) -> dict:
    try:
        # Step 3: build and run the shared OpenSearch query.
        body, date_filter = _build_search_body(req)
        _log_workflow_step(
            3,
            "OpenSearch search request",
            {"request": req.model_dump(), "body": _summarize_search_body_for_log(body), "date_filter": date_filter},
            verbose_only=True,
        )
        res = es.search(index=SEARCH_INDEX_NAME, body=body)
        hits_obj = res.get("hits", {})
        hits = hits_obj.get("hits", [])
        total_obj = hits_obj.get("total", 0)
        total = total_obj.get("value", 0) if isinstance(total_obj, dict) else int(total_obj or 0)
        results = []
        for hit in hits:
            source = hit.get("_source", {})
            item = {
                "id": hit.get("_id"),
                "score": hit.get("_score"),
                "source": source,
                "highlight": hit.get("highlight", {}),
            }
            if "created_at" in source:
                item["source"]["formatted_date"] = format_for_display(source.get("created_at"))
            results.append(item)
        result = {
            "total": total,
            "page": req.page,
            "per_page": req.per_page,
            "total_pages": (total + req.per_page - 1) // req.per_page if total > 0 else 1,
            "results": results,
        }
        _log_workflow_step(3, "OpenSearch search response", {"total": total, "returned": len(results)}, verbose_only=True)
        return result
    except Exception as e:
        logger.exception("_execute_search failed")
        return {"total": 0, "results": [], "error": str(e)}


def _execute_raw_search(body: dict[str, Any], page: int, per_page: int) -> dict:
    try:
        _log_verbose("_execute_raw_search request", {"page": page, "per_page": per_page, "body": body})
        res = es.search(index=SEARCH_INDEX_NAME, body=body)
        hits_obj = res.get("hits", {})
        hits = hits_obj.get("hits", [])
        total_obj = hits_obj.get("total", 0)
        total = total_obj.get("value", 0) if isinstance(total_obj, dict) else int(total_obj or 0)
        results = []
        for hit in hits:
            source = hit.get("_source", {})
            item = {
                "id": hit.get("_id"),
                "score": hit.get("_score"),
                "source": source,
                "highlight": hit.get("highlight", {}),
            }
            if "created_at" in source:
                item["source"]["formatted_date"] = format_for_display(source.get("created_at"))
            results.append(item)
        result = {
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 1,
            "results": results,
        }
        _log_verbose("_execute_raw_search response", {"total": total, "returned": len(results)})
        return result
    except Exception as exc:
        logger.exception("_execute_raw_search failed")
        return {"total": 0, "results": [], "error": str(exc)}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def orchestrate_agent_chat(question: str, chat_id: Optional[str] = None) -> dict:
    # Step 1: accept the request and determine which backend task should handle it.
    intent_result = IntentClassifier.classify(question)
    intent = intent_result.intent
    params = intent_result.parameters
    resolved_chat_id = chat_id or str(uuid4())
    classification = _classification_debug_payload(question, intent_result)
    _log_workflow_step(
        1,
        "Route request into agent workflow",
        {"question": question, "chat_id": chat_id, "resolved_chat_id": resolved_chat_id, "intent": intent.value, "parameters": params},
        verbose_only=True,
    )

    response_payload = {}
    try:
        if intent == IntentType.KEYWORD_SEARCH:
            agent_result = await KeywordSearchAgent.execute(question, parameters=params)
            if agent_result.get("results"):
                answer = f"Found {agent_result['total']} documents matching your keyword search.\nTop results:\n"
                for r in agent_result["results"][:5]:
                    title = r["source"].get("title", "Untitled")
                    answer += f"- {title} (ID: {r['id']})\n"
            else:
                answer = "No documents found for your keyword search."
            response_payload = {"answer": answer, "search_results": agent_result}

        elif intent == IntentType.SEMANTIC_SEARCH:
            agent_result = await SemanticSearchAgent.execute(question, parameters=params)
            if agent_result.get("results"):
                answer = f"Found {agent_result['total']} similar cases.\nMost relevant:\n"
                for r in agent_result["results"][:5]:
                    title = r["source"].get("title", "Untitled")
                    answer += f"- {title} (ID: {r['id']}, score: {r['score']:.2f})\n"
            else:
                answer = "No similar cases found."
            response_payload = {"answer": answer, "search_results": agent_result}

        elif intent == IntentType.STATS_COUNT:
            agent_result = await StatsAgent.execute(question, params)
            if "count" in agent_result:
                answer = f"Number of documents: {agent_result['count']}"
                if "date_range" in agent_result:
                    answer += f" for period {agent_result['date_range']}"
                if agent_result.get("topic"):
                    answer += f" related to {agent_result['topic']}"
            else:
                answer = f"Could not compute statistics: {agent_result.get('error', 'Unknown error')}"
            response_payload = {"answer": answer, "stats": agent_result}

        elif intent == IntentType.SINGLE_DOC_SUMMARY:
            agent_result: dict[str, Any] = {}
            doc_id = params.get("doc_id")
            if not doc_id:
                answer = "Could not identify a document ID. Please provide a valid document ID."
            else:
                agent_result = await SingleDocSummaryAgent.execute(doc_id)
                if "summary" in agent_result:
                    answer = f"**{agent_result['title']}**\n\nSummary: {agent_result['summary']}"
                else:
                    answer = f"Error: {agent_result.get('error', 'Document not found')}"
            response_payload = {"answer": answer, "doc_summary": agent_result}

        elif intent == IntentType.MIXED_SEARCH_SUMMARY:
            agent_result = await MixedSearchSummaryAgent.execute(question, parameters=params)
            if "summary" in agent_result:
                answer = agent_result["summary"]
            else:
                answer = agent_result.get("error", "No results to summarize.")
            response_payload = {"answer": answer, "mixed_result": agent_result}

        else:  # GENERAL_RAG_QA
            agent_result = await RagAnswerAgent.execute(question, resolved_chat_id, params)
            answer = agent_result["answer"]
            response_payload = {
                "answer": answer,
                "token_usage": agent_result.get("token_usage", {}),
                "search_results": agent_result.get("search_results", []),
                "sources": agent_result.get("sources", []),
            }

        if intent != IntentType.GENERAL_RAG_QA:
            payload = {"question": question, "intent": intent.value, "response_payload": response_payload}
            token_usage = response_payload.get("token_usage", {})
            _save_chat_log(resolved_chat_id, payload, answer, token_usage)

        # Step 6: return the final agent response payload.
        result = {
            "chat_id": resolved_chat_id,
            "answer": response_payload.get("answer", "No answer generated."),
            "intent": intent.value,
            "classification": classification,
            "debug_info": response_payload
        }
        _log_workflow_step(6, "Final agent response ready", {"chat_id": resolved_chat_id, "intent": intent.value}, verbose_only=True)
        return result
    except Exception as e:
        logger.exception("Orchestrator failed")
        return {
            "chat_id": resolved_chat_id,
            "answer": f"Sorry, an error occurred: {str(e)}",
            "intent": intent.value,
            "error": str(e)
        }

# ---------------------------------------------------------------------------
# Utility functions (original, unchanged)
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

def _normalize_string_list(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = " ".join(str(value).split()).strip()
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned)
    return normalized

def _normalize_metadata_filters(values: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for raw_key, raw_value in values.items():
        key = " ".join(str(raw_key).split()).strip()
        value = " ".join(str(raw_value).split()).strip()
        if key and value:
            normalized[key] = value
    return normalized

def _build_filter_clauses(req: SearchRequest, date_filter: dict[str, str]) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    if date_filter:
        filters.append({"range": {"created_at": date_filter}})
    owners = _normalize_string_list(req.owners)
    if owners:
        filters.append({"terms": {"owner": owners}})
    categories = _normalize_string_list(req.categories)
    if categories:
        filters.append({"terms": {"category": categories}})
    tags = _normalize_string_list(req.tags)
    if tags:
        filters.append({"terms": {"tags": tags}})
    folder_names = _normalize_string_list(req.folder_names)
    if folder_names:
        filters.append({"terms": {"folder_name": folder_names}})
    folder_paths = _normalize_string_list(req.folder_paths)
    if folder_paths:
        filters.append({"terms": {"folder_path.keyword": folder_paths}})
    metadata_filters = _normalize_metadata_filters(req.metadata_filters)
    for key, value in metadata_filters.items():
        filters.append({
            "nested": {
                "path": "metadata_entries",
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"metadata_entries.key": key}},
                            {"term": {"metadata_entries.value.keyword": value}},
                        ]
                    }
                },
            }
        })
    return filters

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
    return sum(len((msg.get("content") or "")) // 4 for msg in messages)

def _count_text_tokens_approx(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)

def _get_embedding_model():
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model
    model_path = os.getenv("EMBEDDING_MODEL_PATH", "./local_models/multilingual-e5-small")
    try:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer(model_path)
        logger.info("Loaded embedding model from %s", model_path)
    except Exception as exc:
        logger.warning("Embedding model unavailable, fallback to text-only search: %s", exc)
        _embedding_model = False
    return _embedding_model

def _get_chatlog_messages(chat_id: str) -> list[dict[str, str]]:
    try:
        _log_verbose("Fetching chat log from OpenSearch", {"chat_id": chat_id, "index": CHAT_LOG_INDEX})
        response = es.get(index=CHAT_LOG_INDEX, id=chat_id)
        payload = response.get("_source", {}).get("payload", {})
        messages = payload.get("messages", [])
        _log_verbose("Chat log found", {"chat_id": chat_id, "message_count": len(messages) if isinstance(messages, list) else 0})
        return messages if isinstance(messages, list) else []
    except NotFoundError:
        _log_verbose("Chat log not found", {"chat_id": chat_id, "index": CHAT_LOG_INDEX})
        return []

def _extract_provider_usage(provider_payload: Optional[dict[str, Any]]) -> dict[str, Any]:
    payload = provider_payload or {}
    prompt_tokens = payload.get("prompt_eval_count")
    completion_tokens = payload.get("eval_count")
    total_tokens = None
    if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
        total_tokens = prompt_tokens + completion_tokens
    usage: dict[str, Any] = {
        "provider_prompt_tokens": prompt_tokens,
        "provider_completion_tokens": completion_tokens,
        "provider_total_tokens": total_tokens,
    }
    for field in ("total_duration", "load_duration", "prompt_eval_duration", "eval_duration"):
        if field in payload:
            usage[field] = payload.get(field)
    return usage

def _build_token_usage(messages: list[dict[str, str]], assistant_response: str, provider_payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    input_tokens_approx = _count_tokens_approx(messages)
    output_tokens_approx = _count_text_tokens_approx(assistant_response)
    usage = {
        "input_tokens_approx": input_tokens_approx,
        "output_tokens_approx": output_tokens_approx,
        "total_tokens_approx": input_tokens_approx + output_tokens_approx,
        "message_count": len(messages),
        "assistant_characters": len(assistant_response or ""),
    }
    usage.update(_extract_provider_usage(provider_payload))
    return usage

def _save_chat_log(chat_id: str, payload: dict[str, Any], assistant_response: str, token_usage: Optional[dict[str, Any]] = None) -> None:
    doc = {
        "chat_id": chat_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload": payload,
        "response": assistant_response,
        "token_usage": token_usage or {},
    }
    _log_workflow_step(
        5,
        "Save chat log to OpenSearch",
        {
            "chat_id": chat_id,
            "index": CHAT_LOG_INDEX,
            "payload_summary": _summarize_llm_payload_for_log(payload),
            "assistant_response_preview": _preview_text(assistant_response, 300),
            "token_usage": token_usage or {},
        },
        verbose_only=True,
    )
    es.index(index=CHAT_LOG_INDEX, id=chat_id, body=doc, refresh=True)

# ---------------------------------------------------------------------------
# LLM integration (original)
# ---------------------------------------------------------------------------

def _build_messages(chat_id: Optional[str], user_prompt: str, system_prompt: Optional[str] = None) -> tuple[str, list[dict[str, str]]]:
    resolved_chat_id = chat_id or str(uuid4())
    messages = _get_chatlog_messages(resolved_chat_id)
    if system_prompt and not any(msg.get("role") == "system" for msg in messages):
        messages.insert(0, {"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    _log_verbose("Built message list", {"chat_id": resolved_chat_id, "message_count": len(messages), "last_user_prompt_preview": user_prompt[:300]})
    return resolved_chat_id, messages

def _build_llm_payload(messages: list[dict[str, str]], stream: bool) -> dict[str, Any]:
    payload = {
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
    _log_verbose("Built LLM payload", _summarize_llm_payload_for_log(payload))
    return payload

def _generate_completion(chat_id: Optional[str], user_prompt: str, system_prompt: Optional[str] = None) -> dict[str, Any]:
    # Step 5: send the prepared prompt to the LLM and collect the answer.
    resolved_chat_id, messages = _build_messages(chat_id, user_prompt, system_prompt=system_prompt)
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
    _log_workflow_step(
        5,
        "Send non-stream LLM request",
        {"chat_id": resolved_chat_id, "llm_api": LLM_API, "payload": _summarize_llm_payload_for_log(payload)},
        verbose_only=True,
    )
    response = requests.post(LLM_API, json=payload, headers={"Content-Type": "application/json"}, timeout=90)
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"LLM API error: {response.status_code}")
    body = response.json()
    _log_workflow_step(
        5,
        "Received non-stream LLM response",
        {"chat_id": resolved_chat_id, "response": _summarize_provider_response_for_log(body)},
        verbose_only=True,
    )
    assistant_response = remove_deepthink(body.get("message", {}).get("content", ""))
    payload["messages"].append({"role": "assistant", "content": assistant_response})
    token_usage = _build_token_usage(messages, assistant_response, body)
    _save_chat_log(resolved_chat_id, payload, assistant_response, token_usage)
    return {
        "chat_id": resolved_chat_id,
        "answer": assistant_response,
        "token_usage": token_usage,
    }

def _generate_completion_stream(chat_id: Optional[str], user_prompt: str, system_prompt: Optional[str] = None):
    resolved_chat_id, messages = _build_messages(chat_id, user_prompt, system_prompt=system_prompt)
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
        final_event: dict[str, Any] = {}
        try:
            _log_workflow_step(
                5,
                "Send stream LLM request",
                {"chat_id": resolved_chat_id, "llm_api": LLM_API, "payload": _summarize_llm_payload_for_log(payload)},
                verbose_only=True,
            )
            response = requests.post(LLM_API, json=payload, headers={"Content-Type": "application/json"}, stream=True, timeout=90)
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
                if data.get("done") is True:
                    final_event = data
                    _log_workflow_step(
                        5,
                        "Received final stream event",
                        {"chat_id": resolved_chat_id, "event": _summarize_provider_response_for_log(final_event)},
                        verbose_only=True,
                    )
                chunk = data.get("message", {}).get("content")
                if not chunk:
                    continue
                assistant_response += chunk
                yield f"data: {json.dumps({'chunk': chunk, 'chat_id': resolved_chat_id, 'complete': False})}\n\n"
            cleaned = assistant_response.strip()
            payload["messages"].append({"role": "assistant", "content": cleaned})
            token_usage = _build_token_usage(messages, cleaned, final_event)
            _save_chat_log(resolved_chat_id, payload, cleaned, token_usage)
            yield f"data: {json.dumps({'complete': True, 'chat_id': resolved_chat_id, 'token_usage': token_usage})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc), 'complete': True})}\n\n"
    return _event_generator()

# ---------------------------------------------------------------------------
# OpenSearch search body builder (original)
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
                "description": {},
                "metadata_text": {},
                "folder_path": {},
            }
        },
    }
    filter_clauses = _build_filter_clauses(req, date_filter)
    text_fields = ["ocr_content", "title^2", "description", "metadata_text", "folder_name", "folder_path"]
    if query:
        if search_mode == "text":
            if filter_clauses:
                body["query"] = {
                    "bool": {
                        "must": [{"multi_match": {"query": query, "fields": text_fields}}],
                        "filter": filter_clauses,
                    }
                }
            else:
                body["query"] = {"multi_match": {"query": query, "fields": text_fields}}
            return body, date_filter
        embedder = _get_embedding_model()
        if embedder is False:
            if filter_clauses:
                body["query"] = {
                    "bool": {
                        "must": [{"multi_match": {"query": query, "fields": text_fields}}],
                        "filter": filter_clauses,
                    }
                }
            else:
                body["query"] = {"multi_match": {"query": query, "fields": text_fields}}
            return body, date_filter
        query_embedding = embedder.encode(f"query: {query}", normalize_embeddings=True).tolist()
        hybrid_queries = []
        text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields}}
        if filter_clauses:
            text_query = {
                "bool": {
                    "must": [{"multi_match": {"query": query, "fields": text_fields}}],
                    "filter": filter_clauses,
                }
            }
        hybrid_queries.append(text_query)
        title_knn = {"knn": {TITLE_VECTOR_FIELD: {"vector": query_embedding, "k": 50}}}
        if filter_clauses:
            title_knn["knn"][TITLE_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}
        hybrid_queries.append(title_knn)
        content_knn = {"knn": {CONTENT_VECTOR_FIELD: {"vector": query_embedding, "k": 50}}}
        if filter_clauses:
            content_knn["knn"][CONTENT_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}
        hybrid_queries.append(content_knn)
        body["query"] = {"hybrid": {"queries": hybrid_queries}}
        body["search_pipeline"] = "rrf-pipeline"
        return body, date_filter
    if filter_clauses:
        body["query"] = {"bool": {"filter": filter_clauses}}
    else:
        body["query"] = {"match_all": {}}
    return body, date_filter

# ---------------------------------------------------------------------------
# API routes (original /search, /chat, /summarize-multiple, /chats/{chat_id})
# plus new /agent-chat
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
        except Exception as search_exc:
            if (req.search_mode or "").lower() == "hybrid":
                logger.warning("Hybrid query failed, falling back to text search: %s", search_exc)
                fallback_req = SearchRequest(
                    q=req.q,
                    start_date=req.start_date,
                    end_date=req.end_date,
                    owners=req.owners,
                    categories=req.categories,
                    tags=req.tags,
                    folder_names=req.folder_names,
                    folder_paths=req.folder_paths,
                    metadata_filters=req.metadata_filters,
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
    except Exception as exc:
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

@app.post("/api/chatbot/agent-chat")
async def agent_chat(req: ChatRequest):
    """
    Multi‑agent endpoint: classifies intent and routes to specialist agents.
    """
    # Step 1: receive the frontend request and decide whether to use the agent workflow.
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Missing question")
    _log_workflow_step(
        1,
        "Receive /api/chatbot/agent-chat request",
        {"chat_id": req.chat_id, "stream": req.stream, "question": req.question, "press_releases_count": len(req.press_releases)},
    )
    # If press releases are provided, fallback to original chat
    if req.press_releases:
        return chat(req)

    if req.stream:
        intent_result = IntentClassifier.classify(req.question)
        generator = await _build_agent_stream(req.question, req.chat_id, intent_result)
        return StreamingResponse(generator, media_type="text/event-stream")

    result = await orchestrate_agent_chat(req.question, req.chat_id)
    _log_verbose("/api/chatbot/agent-chat response", result)
    return result

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
    token_usage = {}
    try:
        response = es.get(index=CHAT_LOG_INDEX, id=chat_id)
        token_usage = response.get("_source", {}).get("token_usage", {})
    except NotFoundError:
        token_usage = {}
    return {
        "chat_id": chat_id,
        "messages": _get_chatlog_messages(chat_id),
        "token_usage": token_usage,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("chatbot_agent_api:app", host="0.0.0.0", port=int(os.getenv("CHATBOT_API_PORT", "5100")), reload=True)