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
DEFAULT_CHUNK_SEARCH_INDEX_NAME = "dms-documents-chatbot-chunks"
CHUNK_SEARCH_INDEX_NAME = (
    os.getenv("CHATBOT_CHUNK_SEARCH_INDEX_NAME")
    or os.getenv("SEARCH_CHUNK_INDEX_NAME")
    or DEFAULT_CHUNK_SEARCH_INDEX_NAME
)
CHAT_LOG_INDEX = os.getenv("CHAT_LOG_INDEX", "chat_logs_dms")
TITLE_VECTOR_FIELD = os.getenv("SEARCH_TITLE_VECTOR_FIELD", "chatbot_title_embedding")
CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")
CHUNK_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_VECTOR_FIELD", "chunk_embedding")
CHUNK_TEXT_FIELD = os.getenv("SEARCH_CHUNK_TEXT_FIELD", "chunk_text")

LLM_API = os.getenv("LLM_API", "http://localhost:11434/api/chat")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-r1:14b")
CLASSIFIER_TIMEOUT_SECONDS = int(os.getenv("CHATBOT_CLASSIFIER_TIMEOUT_SECONDS", "20"))

# DMS Java backend base URL used for housekeeping and other backend calls.
DMS_BASE_URL = os.getenv("DMS_BASE_URL", "http://localhost:8080")

MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", "5000"))
WARNING_THRESHOLD = int(os.getenv("WARNING_THRESHOLD", "4000"))
VERBOSE_LOGS = os.getenv("CHATBOT_VERBOSE_LOGS", "false").lower() == "true"
DEBUG_SEARCH_BODY = os.getenv("CHATBOT_DEBUG_SEARCH_BODY", "true").lower() == "true"

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


def _log_search_body(label: str, index_name: str, body: dict[str, Any]) -> None:
    if not DEBUG_SEARCH_BODY:
        return
    try:
        rendered = json.dumps(body, ensure_ascii=False, indent=2)
    except Exception:  # noqa: BLE001
        rendered = repr(body)
    logger.info("%s | index=%s\n%s", label, index_name, rendered)

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
    exact_phrase: bool = False
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
#
# Sequential two-agent workflow overview
# ──────────────────────────────────────
# Agent 1  (_build_search_strategy_prompt)
#   Classifies the search_strategy and fills the search template.
#   Output → one of: keyword_search | hybrid_search | no_search
#
#   keyword_search template shape:
#     query        : raw user text (or joined from must/should_terms)
#     match_mode   : "exact_phrase" | "all_terms" | "any_terms"
#     exact_phrase : str  ← used when match_mode="exact_phrase"
#     must_terms   : [str, ...]  ← all terms must appear (AND)
#     should_terms : [str, ...]  ← at least one term must appear (OR)
#     start_date / end_date / owners / categories / tags /
#     folder_names / folder_paths / metadata_filters  ← optional filters
#
#   hybrid_search template shape:
#     query        : raw user text (used for vector + BM25 hybrid)
#     search_mode  : "hybrid"  (multi_match + two knn queries via rrf-pipeline)
#     start_date / end_date / owners / categories / tags /
#     folder_names / folder_paths / metadata_filters  ← optional filters
#     (match_mode / must_terms / should_terms are NOT used)
#
#   no_search template shape:
#     query        : raw user text (forwarded directly to LLM)
#     (no OpenSearch call is made)
#
# Agent 2  (_build_task_type_prompt)
#   Sees the chosen strategy + a preview of search results and decides
#   what to do with them.
#   Output → one of: list_documents | answer_question |
#                    summarize_results | count_results | single_doc_summary
#
# Intent derivation  (_derive_intent_from_plan)
#   Combines (search_strategy, task_type) → IntentType for the stream router.
#
#   Strategy × Task → Intent
#   ┌──────────────────┬──────────────────────┬──────────────────────────┐
#   │ search_strategy  │ task_type            │ intent                   │
#   ├──────────────────┼──────────────────────┼──────────────────────────┤
#   │ keyword_search   │ list_documents       │ KEYWORD_SEARCH           │
#   │ hybrid_search    │ list_documents       │ SEMANTIC_SEARCH          │
#   │ keyword_search   │ answer_question      │ GENERAL_RAG_QA           │
#   │ hybrid_search    │ answer_question      │ GENERAL_RAG_QA           │
#   │ keyword_search   │ summarize_results    │ MIXED_SEARCH_SUMMARY     │
#   │ hybrid_search    │ summarize_results    │ MIXED_SEARCH_SUMMARY     │
#   │ keyword_search   │ count_results        │ STATS_COUNT              │
#   │ hybrid_search    │ count_results        │ STATS_COUNT              │
#   │ any              │ single_doc_summary   │ SINGLE_DOC_SUMMARY       │
#   │ no_search        │ answer_question      │ FREE_OPEN_CHAT           │
#   └──────────────────┴──────────────────────┴──────────────────────────┘
# ---------------------------------------------------------------------------

class IntentType(str, Enum):
    # Final routing target used by _build_agent_stream.
    KEYWORD_SEARCH = "keyword_search"        # literal term search → list docs
    SEMANTIC_SEARCH = "semantic_search"      # hybrid vector+BM25 → list docs
    STATS_COUNT = "stats_count"              # count matched documents
    SINGLE_DOC_SUMMARY = "single_doc_summary"  # summarise one document by ID
    MIXED_SEARCH_SUMMARY = "mixed_search_summary"  # search then summarise results
    GENERAL_RAG_QA = "general_rag_qa"        # search then answer via LLM+context
    FREE_OPEN_CHAT = "free_open_chat"        # no search, direct LLM conversation


class SearchStrategy(str, Enum):
    # Chosen by Agent 1.
    KEYWORD_SEARCH = "keyword_search"   # uses match_mode + must/should_terms
    HYBRID_SEARCH = "hybrid_search"     # uses vector knn + BM25 via rrf-pipeline
    NO_SEARCH = "no_search"             # skips OpenSearch entirely


class TaskType(str, Enum):
    # Chosen by Agent 2 after seeing retrieved results.
    LIST_DOCUMENTS = "list_documents"       # return a list of matching doc titles/IDs
    ANSWER_QUESTION = "answer_question"     # answer using retrieved context or open chat
    SUMMARIZE_RESULTS = "summarize_results" # deprecated: normalized to ANSWER_QUESTION
    COUNT_RESULTS = "count_results"         # return a document count only
    SINGLE_DOC_SUMMARY = "single_doc_summary"  # deprecated: normalized to ANSWER_QUESTION

class IntentResult(BaseModel):
    intent: IntentType
    search_strategy: SearchStrategy = SearchStrategy.HYBRID_SEARCH
    task_type: TaskType = TaskType.ANSWER_QUESTION
    parameters: dict[str, Any] = Field(default_factory=dict)
    search_result: dict[str, Any] | None = None
    confidence: float = 1.0
    classification_source: str = "llm"


KEYWORD_MATCH_MODES = {"exact_phrase", "all_terms", "any_terms"}


CLASSIFIER_SYSTEM_PROMPT = (
    "You are a planner for a document-management chatbot. "
    "Follow the user's instructions exactly, return JSON only, and do not add explanations outside the schema."
)


def _classification_debug_payload(question: str, result: IntentResult) -> dict[str, Any]:
    return {
        "question": question,
        "intent": result.intent.value,
        "search_strategy": result.search_strategy.value,
        "task_type": result.task_type.value,
        "confidence": result.confidence,
        "classification_source": result.classification_source,
        "search_template": _summarize_search_template_for_log(result.parameters),
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

OPEN_CHAT_SYSTEM_PROMPT = (
    "You are a helpful assistant for general open-ended questions. "
    "Answer directly and clearly. "
    "If the user is asking for document-grounded evidence, say that this reply is not using document retrieval."
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

SEARCH_FILTER_KEYS = (
    "start_date",
    "end_date",
    "owners",
    "categories",
    "tags",
    "folder_names",
    "folder_paths",
    "metadata_filters",
)


def _summarize_search_template_for_log(parameters: dict[str, Any]) -> dict[str, Any]:
    return {
        "query": parameters.get("query", ""),
        "search_mode": parameters.get("search_mode"),
        "match_mode": parameters.get("match_mode"),
        "exact_phrase": parameters.get("exact_phrase"),
        "must_terms": parameters.get("must_terms", []),
        "should_terms": parameters.get("should_terms", []),
        "start_date": parameters.get("start_date", ""),
        "end_date": parameters.get("end_date", ""),
        "owners": parameters.get("owners", []),
        "categories": parameters.get("categories", []),
        "tags": parameters.get("tags", []),
        "folder_names": parameters.get("folder_names", []),
        "folder_paths": parameters.get("folder_paths", []),
        "metadata_filters": parameters.get("metadata_filters", {}),
    }

# ---------------------------------------------------------------------------
# Specialist agents
# ---------------------------------------------------------------------------

class KeywordSearchAgent:
    """
    Executes a structured keyword search against OpenSearch.

    Expected search template fields
    ────────────────────────────────
    match_mode     : "exact_phrase" | "all_terms" | "any_terms" | None
    exact_phrase   : str   – literal phrase query  (match_mode="exact_phrase")
    must_terms     : list  – every term must match  (match_mode="all_terms")
                             → builds one must:multi_match clause per term
    should_terms   : list  – at least one term matches (match_mode="any_terms")
                             → builds should clauses with minimum_should_match=1
    query          : str   – plain free-text fallback when no term lists supplied

    Common filter fields (all optional)
    ─────────────────────────────────────
    start_date / end_date  : ISO date strings → range filter on created_at
    owners                 : list[str]  → terms filter on owner field
    categories             : list[str]  → terms filter on category field
    tags                   : list[str]  → terms filter on tags field
    folder_names           : list[str]  → terms filter on folder_name field
    folder_paths           : list[str]  → terms filter on folder_path.keyword
    metadata_filters       : dict[str, str] → nested key/value filters

    OpenSearch query shape produced
    ─────────────────────────────────
    {
      "query": {
        "bool": {
          "must":   [ { "multi_match": { "query": term, "operator": "and" } }, ... ],
          "should": [ { "multi_match": { "query": term, "operator": "and" } }, ... ],
          "filter": [ <date/owner/category/tag/folder/metadata clauses> ]
        }
      }
    }
    Falls back to a plain multi_match on the full query string when no
    term lists are filled and match_mode cannot be inferred.
    """
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
            # Infer match_mode when the LLM left it null but supplied terms.
            if not match_mode:
                if params.get("must_terms"):
                    match_mode = "all_terms"
                elif params.get("should_terms"):
                    match_mode = "any_terms"

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
                        "ocr_content": {"type": "unified", "number_of_fragments": 3, "fragment_size": 300},
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
    """
    Executes a hybrid vector + BM25 search via OpenSearch's rrf-pipeline.

    Expected search template fields
    ────────────────────────────────
    query          : str  – natural language query text
                           encoded into a vector by the E5 embedding model;
                           also used as the BM25 multi_match query
    search_mode    : "hybrid" (always; text-only falls back to multi_match)

    Common filter fields (all optional, same as KeywordSearchAgent)
    ─────────────────────────────────────────────────────────────────
    start_date / end_date / owners / categories / tags /
    folder_names / folder_paths / metadata_filters

    OpenSearch query shape produced
    ─────────────────────────────────
    {
      "query": {
        "hybrid": {
          "queries": [
            { "multi_match": { "query": "<text>" } },          ← BM25
            { "knn": { "chatbot_title_embedding":   { ... } } }, ← title vector
            { "knn": { "chatbot_ocr_content_embedding": { ... } } }  ← content vector
          ]
        }
      },
      "search_pipeline": "rrf-pipeline"   ← reciprocal-rank fusion
    }
    Results are ranked by RRF score combining all three sub-queries.
    Falls back to plain multi_match when the embedding model is unavailable.
    """
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
        date_info = params.get("date_range")
        if not date_info:
            return {"error": "Could not parse date range from question", "count": 0}

        topic = params.get("topic")
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
                        "fields": ["folder_name", "title", "description", "metadata_text", "ocr_content"],
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
    async def execute(
        question: str,
        parameters: dict[str, Any] | None = None,
        search_strategy: SearchStrategy = SearchStrategy.HYBRID_SEARCH,
        search_result: dict[str, Any] | None = None,
        top_k: int = 5,
    ) -> dict:
        _log_verbose("MixedSearchSummaryAgent.execute invoked", {"question": question, "parameters": parameters or {}, "top_k": top_k})
        resolved_search_result = search_result or await _execute_search_strategy(question, parameters, search_strategy)
        results = resolved_search_result.get("results", [])[:top_k]
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
    async def execute(
        question: str,
        chat_id: Optional[str],
        parameters: dict[str, Any] | None = None,
        search_strategy: SearchStrategy = SearchStrategy.HYBRID_SEARCH,
        search_result: dict[str, Any] | None = None,
        top_k: int = 5,
    ) -> dict:
        # Step 4: retrieve the most relevant chunks for grounded answering.
        params = parameters or {}
        _log_verbose("RagAnswerAgent.execute invoked", {"question": question, "chat_id": chat_id, "parameters": params, "top_k": top_k})
        chunk_search_result = _execute_chunk_search(question, params, top_k=top_k)
        results = chunk_search_result.get("results", [])[:top_k]
        used_chunk_context = bool(results)

        if not results:
            # Backward-compatible fallback for older indexes that have no chunk docs yet.
            resolved_search_result = search_result or await _execute_search_strategy(question, params, search_strategy)
            results = resolved_search_result.get("results", [])[:top_k]

        if not results:
            return {
                "answer": "I could not find relevant documents to answer this question.",
                "search_results": [],
                "sources": [],
                "token_usage": {},
            }

        context = _build_chunk_rag_context(results) if used_chunk_context else _build_rag_context(results)
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
                "docs": [
                    _summarize_chunk_result_for_log(item) if used_chunk_context else _summarize_result_for_log(item)
                    for item in results
                ],
                "rag_prompt_preview": rag_prompt,
                "chunk_context": used_chunk_context,
            },
            verbose_only=True,
        )
        completion = _generate_completion(chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        sources = (
            _build_document_sources_from_chunk_results(results)
            if used_chunk_context
            else [_summarize_result_for_log(item) for item in results]
        )
        answer_with_sources = f"{completion['answer']}{_format_retrieved_docs_section(sources)}"
        return {
            "answer": answer_with_sources,
            "search_results": results,
            "sources": sources,
            "token_usage": completion.get("token_usage", {}),
        }


async def _resolve_search_result(question: str, intent_result: IntentResult) -> dict[str, Any] | None:
    if intent_result.search_strategy == SearchStrategy.NO_SEARCH:
        return None
    if intent_result.search_result is not None:
        return intent_result.search_result
    return await _execute_search_strategy(question, intent_result.parameters, intent_result.search_strategy)


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
    search_strategy = intent_result.search_strategy
    params = intent_result.parameters
    prefetched_search_result = await _resolve_search_result(question, intent_result)
    resolved_chat_id = chat_id or str(uuid4())
    classification_meta = {"classification": _classification_debug_payload(question, intent_result)}
    _log_verbose(
        "_build_agent_stream start",
        {"question": question, "chat_id": chat_id, "resolved_chat_id": resolved_chat_id, "intent": intent.value, "parameters": params},
    )

    if intent == IntentType.KEYWORD_SEARCH:
        agent_result = prefetched_search_result or await KeywordSearchAgent.execute(question, parameters=params)
        results = agent_result.get("results", [])
        if results:
            answer = f"Found {agent_result['total']} documents matching your keyword search.\nTop results:\n"
            for result in results[:5]:
                title = result["source"].get("title", "Untitled")
                answer += f"- {title} (ID: {result['id']})\n"
        else:
            answer = "No documents found for your keyword search."
        sources = [_summarize_result_for_log(r) for r in results[:5]]
        return _wrap_stream_with_metadata(
            _stream_text_response(answer, resolved_chat_id, intent),
            intent,
            {"sources": sources, **classification_meta},
        )

    if intent == IntentType.SEMANTIC_SEARCH:
        agent_result = prefetched_search_result or await SemanticSearchAgent.execute(question, parameters=params)
        results = agent_result.get("results", [])
        if results:
            answer = f"Found {agent_result['total']} similar cases.\nMost relevant:\n"
            for result in results[:5]:
                title = result["source"].get("title", "Untitled")
                answer += f"- {title} (ID: {result['id']}, score: {result['score']:.2f})\n"
        else:
            answer = "No similar cases found."
        sources = [_summarize_result_for_log(r) for r in results[:5]]
        return _wrap_stream_with_metadata(
            _stream_text_response(answer, resolved_chat_id, intent),
            intent,
            {"sources": sources, **classification_meta},
        )

    if intent == IntentType.STATS_COUNT:
        agent_result = prefetched_search_result or await _execute_search_strategy(question, params, search_strategy)
        answer = f"Number of documents: {agent_result.get('total', 0)}"
        return _stream_text_response(answer, resolved_chat_id, intent, classification_meta)

    if intent == IntentType.GENERAL_RAG_QA:
        chunk_search_result = _execute_chunk_search(question, params, top_k=5)
        results = chunk_search_result.get("results", [])[:5]
        used_chunk_context = bool(results)
        if not results:
            search_result = prefetched_search_result or await _execute_search_strategy(question, params, search_strategy)
            results = search_result.get("results", [])[:5]
        if not results:
            return _stream_text_response(
                "I could not find relevant documents to answer this question.",
                resolved_chat_id,
                intent,
                classification_meta,
            )

        context = _build_chunk_rag_context(results) if used_chunk_context else _build_rag_context(results)
        rag_prompt = (
            f"User question: {question}\n\n"
            "Retrieved document context:\n"
            f"{context}\n\n"
            "Answer the question using only the context above. "
            "If the answer is incomplete or uncertain, say what is missing."
        )
        _log_verbose(
            "_build_agent_stream RAG documents",
            {
                "question": question,
                "doc_count": len(results),
                "docs": [
                    _summarize_chunk_result_for_log(item) if used_chunk_context else _summarize_result_for_log(item)
                    for item in results
                ],
                "chunk_context": used_chunk_context,
            },
        )
        generator = _generate_completion_stream(resolved_chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        return _wrap_stream_with_metadata(
            generator,
            intent,
            {
                "sources": (
                    _build_document_sources_from_chunk_results(results)
                    if used_chunk_context
                    else [_summarize_result_for_log(item) for item in results]
                ),
                **classification_meta,
            },
        )

    if intent == IntentType.FREE_OPEN_CHAT:
        generator = _generate_completion_stream(resolved_chat_id, question, system_prompt=OPEN_CHAT_SYSTEM_PROMPT)
        return _wrap_stream_with_metadata(generator, intent, classification_meta)

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
        search_result = prefetched_search_result or await _execute_search_strategy(question, params, search_strategy)
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
    return _stream_text_response(result["answer"], result["chat_id"], intent, classification_meta)


def build_search_parameters(question: str) -> dict[str, Any]:
    """
    Returns the default (blank) search template that Agent 1 will fill.

    Full search template schema
    ────────────────────────────
    Shared by both keyword_search and hybrid_search strategies.
    Agent 1 populates only the fields relevant to the chosen strategy.

    ┌─────────────────────┬────────────────────────────────────────────────────┐
    │ Field               │ Used by                                            │
    ├─────────────────────┼────────────────────────────────────────────────────┤
    │ query               │ Both – free-text query / fallback                  │
    │ search_mode         │ hybrid_search: "hybrid" / keyword_search: "text"   │
    │ match_mode          │ keyword_search: exact_phrase|all_terms|any_terms    │
    │ exact_phrase        │ keyword_search + match_mode="exact_phrase"          │
    │ must_terms          │ keyword_search + match_mode="all_terms"  (AND)      │
    │ should_terms        │ keyword_search + match_mode="any_terms"  (OR)       │
    │ start_date          │ Both – ISO date lower bound for created_at range    │
    │ end_date            │ Both – ISO date upper bound for created_at range    │
    │ owners              │ Both – filter by owner field                        │
    │ categories          │ Both – filter by category field                     │
    │ tags                │ Both – filter by tags field                         │
    │ folder_names        │ Both – filter by folder_name field                  │
    │ folder_paths        │ Both – filter by folder_path.keyword field          │
    │ metadata_filters    │ Both – nested key/value metadata filter             │
    │ search_strategy     │ Propagated to IntentResult for routing              │
    │ task_type           │ Propagated to IntentResult for routing              │
    └─────────────────────┴────────────────────────────────────────────────────┘
    """
    # Let the LLM fill the same search template shape used by the frontend filter section.
    exact_phrase = None
    must_terms: list[str] = []
    should_terms: list[str] = []
    date_range = None
    topic = None

    query = question.strip()

    return _sync_parameter_filters({
        "query": query,
        "start_date": "",
        "end_date": "",
        "owners": [],
        "categories": [],
        "tags": [],
        "folder_names": [],
        "folder_paths": [],
        "metadata_filters": {},
        "exact_phrase": exact_phrase,
        "must_terms": must_terms,
        "should_terms": should_terms,
        "date_range": date_range,
        "topic": topic,
        "filters": {},
        "search_mode": "hybrid",
        "match_mode": None,
        "requires_exact_match": False,
        "requires_summary": False,
        "search_strategy": SearchStrategy.HYBRID_SEARCH.value,
        "task_type": TaskType.ANSWER_QUESTION.value,
    })


def _normalize_classifier_string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value).strip()]


def _normalize_classifier_metadata_filters(values: Any) -> dict[str, str]:
    if not isinstance(values, dict):
        return {}
    normalized: dict[str, str] = {}
    for raw_key, raw_value in values.items():
        key = str(raw_key).strip()
        value = str(raw_value).strip()
        if key and value:
            normalized[key] = value
    return normalized


def _extract_parameter_filters(parameters: dict[str, Any]) -> dict[str, Any]:
    filter_payload: dict[str, Any] = {}
    for key in SEARCH_FILTER_KEYS:
        value = parameters.get(key)
        if isinstance(value, list) and value:
            filter_payload[key] = value
        elif isinstance(value, dict) and value:
            filter_payload[key] = value
        elif isinstance(value, str) and value.strip():
            filter_payload[key] = value.strip()
    return filter_payload


def _sync_parameter_filters(parameters: dict[str, Any]) -> dict[str, Any]:
    parameters["filters"] = _extract_parameter_filters(parameters)
    return parameters


def _merge_classifier_parameters(base_parameters: dict[str, Any], classifier_payload: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base_parameters)
    payload_filters = classifier_payload.get("filters") if isinstance(classifier_payload.get("filters"), dict) else {}

    if classifier_payload.get("phrase"):
        merged["exact_phrase"] = str(classifier_payload["phrase"]).strip()
    if classifier_payload.get("must_terms"):
        merged["must_terms"] = _normalize_classifier_string_list(classifier_payload.get("must_terms", []))
    if classifier_payload.get("should_terms"):
        merged["should_terms"] = _normalize_classifier_string_list(classifier_payload.get("should_terms", []))
    if classifier_payload.get("topic"):
        merged["topic"] = str(classifier_payload["topic"]).strip()
    if classifier_payload.get("doc_id"):
        merged["doc_id"] = str(classifier_payload["doc_id"]).strip()
    if classifier_payload.get("date_range"):
        merged["date_range"] = classifier_payload["date_range"]

    merged["start_date"] = str(classifier_payload.get("start_date") or payload_filters.get("start_date") or merged.get("start_date") or "").strip()
    merged["end_date"] = str(classifier_payload.get("end_date") or payload_filters.get("end_date") or merged.get("end_date") or "").strip()
    merged["owners"] = _normalize_classifier_string_list(classifier_payload.get("owners", payload_filters.get("owners", merged.get("owners", []))))
    merged["categories"] = _normalize_classifier_string_list(classifier_payload.get("categories", payload_filters.get("categories", merged.get("categories", []))))
    merged["tags"] = _normalize_classifier_string_list(classifier_payload.get("tags", payload_filters.get("tags", merged.get("tags", []))))
    merged["folder_names"] = _normalize_classifier_string_list(classifier_payload.get("folder_names", payload_filters.get("folder_names", merged.get("folder_names", []))))
    merged["folder_paths"] = _normalize_classifier_string_list(classifier_payload.get("folder_paths", payload_filters.get("folder_paths", merged.get("folder_paths", []))))
    merged["metadata_filters"] = _normalize_classifier_metadata_filters(
        classifier_payload.get("metadata_filters", payload_filters.get("metadata_filters", merged.get("metadata_filters", {})))
    )

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

    merged["search_strategy"] = str(classifier_payload.get("search_strategy") or merged.get("search_strategy") or SearchStrategy.HYBRID_SEARCH.value)
    merged["task_type"] = str(classifier_payload.get("task_type") or merged.get("task_type") or TaskType.ANSWER_QUESTION.value)

    return _sync_parameter_filters(merged)


def _normalize_search_strategy(strategy_value: Any, intent_value: Any, parameters: dict[str, Any]) -> SearchStrategy:
    has_keyword_plan = bool(
        parameters.get("match_mode") in KEYWORD_MATCH_MODES
        or parameters.get("exact_phrase")
        or parameters.get("must_terms")
        or parameters.get("should_terms")
    )
    if has_keyword_plan:
        return SearchStrategy.KEYWORD_SEARCH

    normalized_value = str(strategy_value or "").strip()
    if normalized_value in {member.value for member in SearchStrategy}:
        return SearchStrategy(normalized_value)

    legacy_intent = str(intent_value or "").strip()
    if legacy_intent == IntentType.KEYWORD_SEARCH.value:
        return SearchStrategy.KEYWORD_SEARCH
    if legacy_intent == IntentType.FREE_OPEN_CHAT.value:
        return SearchStrategy.NO_SEARCH
    if legacy_intent:
        return SearchStrategy.HYBRID_SEARCH
    return SearchStrategy.HYBRID_SEARCH


def _normalize_task_type(task_value: Any, intent_value: Any) -> TaskType:
    normalized_value = str(task_value or "").strip()
    if normalized_value in {TaskType.SUMMARIZE_RESULTS.value, TaskType.SINGLE_DOC_SUMMARY.value}:
        return TaskType.ANSWER_QUESTION
    if normalized_value in {member.value for member in TaskType}:
        return TaskType(normalized_value)

    legacy_intent = str(intent_value or "").strip()
    legacy_mapping = {
        IntentType.KEYWORD_SEARCH.value: TaskType.LIST_DOCUMENTS,
        IntentType.SEMANTIC_SEARCH.value: TaskType.LIST_DOCUMENTS,
        IntentType.STATS_COUNT.value: TaskType.COUNT_RESULTS,
        IntentType.SINGLE_DOC_SUMMARY.value: TaskType.ANSWER_QUESTION,
        IntentType.MIXED_SEARCH_SUMMARY.value: TaskType.ANSWER_QUESTION,
        IntentType.GENERAL_RAG_QA.value: TaskType.ANSWER_QUESTION,
        IntentType.FREE_OPEN_CHAT.value: TaskType.ANSWER_QUESTION,
    }
    return legacy_mapping.get(legacy_intent, TaskType.ANSWER_QUESTION)


def _derive_intent_from_plan(search_strategy: SearchStrategy, task_type: TaskType) -> IntentType:
    """
    Maps the two-agent classification output to the final IntentType used
    by the stream router (_build_agent_stream).

    Priority order (highest wins):
      1. no_search           → FREE_OPEN_CHAT       (no retrieval; pure LLM chat)
      2. count_results       → STATS_COUNT          (return document count)
      3. answer_question     → GENERAL_RAG_QA       (search + LLM answer)
      4. keyword + list_docs → KEYWORD_SEARCH       (return keyword hit list)
      5. hybrid + list_docs  → SEMANTIC_SEARCH      (return vector-ranked list)
    """
    if search_strategy == SearchStrategy.NO_SEARCH:
        return IntentType.FREE_OPEN_CHAT
    if task_type == TaskType.COUNT_RESULTS:
        return IntentType.STATS_COUNT
    if task_type == TaskType.ANSWER_QUESTION:
        return IntentType.GENERAL_RAG_QA
    if search_strategy == SearchStrategy.KEYWORD_SEARCH:
        return IntentType.KEYWORD_SEARCH
    return IntentType.SEMANTIC_SEARCH


async def _execute_search_strategy(
    question: str,
    parameters: dict[str, Any] | None,
    search_strategy: SearchStrategy,
) -> dict[str, Any]:
    params = parameters or {}
    if search_strategy == SearchStrategy.KEYWORD_SEARCH:
        return await KeywordSearchAgent.execute(question, parameters=params)
    if search_strategy == SearchStrategy.NO_SEARCH:
        return {"intent": SearchStrategy.NO_SEARCH.value, "results": [], "total": 0, "parameters": params}
    return await SemanticSearchAgent.execute(question, parameters=params)


def _call_classifier_llm(prompt: str) -> dict[str, Any] | None:
    response = requests.post(
        LLM_API,
        json={
            "model": LLM_MODEL,
            "stream": False,
            "think": False,
            "messages": [
                {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "parameters": {"temperature": 0},
        },
        timeout=CLASSIFIER_TIMEOUT_SECONDS,
    )
    if not response.ok:
        logger.warning("Intent classifier LLM returned HTTP %s", response.status_code)
        return None

    data = response.json()
    content = data.get("message", {}).get("content", "")
    content = re.sub(r'```json\s*|\s*```', '', content.strip())
    return json.loads(content)


def _build_search_strategy_prompt(question: str, base_parameters: dict[str, Any]) -> str:
    current_year = datetime.now().year
    return f"""Return JSON only.

You are agent1 in a sequential workflow.
Your only job is to classify the search_strategy and fill the search template.

User question:
{question}

Initial search template:
{json.dumps(base_parameters, ensure_ascii=False)}

Current year: {current_year}

Rules:
- Choose exactly one search_strategy: keyword_search, hybrid_search, or no_search.
- keyword_search means literal keyword filtering with the template fields and optional exact_phrase, must_terms, and should_terms.
- hybrid_search means normal document retrieval using the same search template fields as chatbot-template__filters-section and chatbot_api.py.
- no_search means the question is a free open question and does not need document retrieval.
- Do not decide the final task type here.
- Do not extract with hardcoded patterns; use the user meaning.
- Fill start_date, end_date, owners, categories, tags, folder_names, folder_paths, and metadata_filters when the user clearly specifies filters.
- If you fill phrase, must_terms, should_terms, or match_mode, search_strategy must be keyword_search.
- If the user wants documents containing term A and term B, use match_mode="all_terms" and return must_terms.
- If the user wants documents containing term A or term B, use match_mode="any_terms" and return should_terms.
- Only use match_mode="exact_phrase" and phrase when the user clearly asks for an exact phrase or literal adjacency match.
- If the only filter is a date, owner, category, folder, or tag (no keyword terms), use hybrid_search, not keyword_search.


Examples:
- Query: documents containing "金融" and "貨幣"
  Return: search_strategy="keyword_search", match_mode="all_terms", must_terms=["金融", "貨幣"]
- Query: find similar tenancy cases
  Return: search_strategy="hybrid_search"
- Query: find the docs updated 18/4/2026
  Return: search_strategy="hybrid_search", start_date="2026-04-18", end_date="2026-04-18"
- Query: show documents created in March 2026
  Return: search_strategy="hybrid_search", start_date="2026-03-01", end_date="2026-03-31"
- Query: documents from 2025 about currency
  Return: search_strategy="keyword_search", should_terms=["currency"], start_date="2025-01-01", end_date="2025-12-31"


Response schema:
{{
  "search_strategy": "keyword_search|hybrid_search|no_search",
  "confidence": 0.0,
  "search_mode": "text|hybrid",
  "match_mode": "exact_phrase|all_terms|any_terms|null",
  "requires_exact_match": false,
  "doc_id": null,
  "start_date": "",
  "end_date": "",
  "owners": [],
  "categories": [],
  "tags": [],
  "folder_names": [],
  "folder_paths": [],
  "metadata_filters": {{}},
  "date_range": null,
  "topic": null,
  "must_terms": [],
  "should_terms": [],
  "phrase": null
}}"""


def _build_search_preview_for_task_classifier(search_result: dict[str, Any] | None, max_results: int = 5) -> list[dict[str, Any]]:
    if not search_result:
        return []
    preview: list[dict[str, Any]] = []
    for item in (search_result.get("results") or [])[:max_results]:
        source = item.get("source", {})
        preview.append(
            {
                "id": item.get("id"),
                "title": source.get("title", "Untitled"),
                "folder_name": source.get("folder_name", ""),
                "folder_path": source.get("folder_path", ""),
                "content_preview": _preview_text(
                    source.get("ocr_content", "")
                    or source.get("content", "")
                    or source.get("description", "")
                    or source.get("metadata_text", ""),
                    240,
                ),
            }
        )
    return preview


def _merge_task_classifier_parameters(base_parameters: dict[str, Any], classifier_payload: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base_parameters)
    if classifier_payload.get("doc_id"):
        merged["doc_id"] = str(classifier_payload["doc_id"]).strip()
    if "requires_summary" in classifier_payload:
        merged["requires_summary"] = bool(classifier_payload["requires_summary"])
    return merged


def _build_task_type_prompt(
    question: str,
    search_strategy: SearchStrategy,
    parameters: dict[str, Any],
    search_result: dict[str, Any] | None,
) -> str:
    search_preview = _build_search_preview_for_task_classifier(search_result)
    return f"""Return JSON only.

You are agent2 in a sequential workflow.
Agent1 already classified the search strategy and filled the search template.
Your only job is to classify the task_type to perform after search results are available.

User question:
{question}

Chosen search_strategy:
{search_strategy.value}

Filled search template:
{json.dumps(parameters, ensure_ascii=False)}

Search results preview:
{json.dumps(search_preview, ensure_ascii=False)}

Rules:
- Choose exactly one task_type: list_documents, answer_question, or count_results.
- list_documents means the user mainly wants matching documents or cases listed.
- answer_question means answer the user using searched documents, unless search_strategy=no_search.
- count_results means count matched documents.
- If the user asks for a summary, classify as answer_question. Do not use summarize_results or single_doc_summary.
- If search_strategy is no_search, prefer answer_question.
- Use the search results preview to decide whether the user is asking for listing, answering, counting, or summarizing.

Response schema:
{{
  "task_type": "list_documents|answer_question|count_results",
  "confidence": 0.0,
  "doc_id": null,
  "requires_summary": false
}}"""


async def _classify_intent_with_llm(question: str, base_parameters: dict[str, Any]) -> IntentResult | None:
    search_strategy_payload = _call_classifier_llm(_build_search_strategy_prompt(question, base_parameters))
    if search_strategy_payload is None:
        return None

    merged_parameters = _merge_classifier_parameters(base_parameters, search_strategy_payload)
    search_strategy = _normalize_search_strategy(search_strategy_payload.get("search_strategy"), "", merged_parameters)
    search_confidence = float(search_strategy_payload.get("confidence", 0.8))

    search_result: dict[str, Any] | None = None
    if search_strategy != SearchStrategy.NO_SEARCH:
        search_result = await _execute_search_strategy(question, merged_parameters, search_strategy)

    task_type_payload = _call_classifier_llm(
        _build_task_type_prompt(question, search_strategy, merged_parameters, search_result)
    )
    if task_type_payload is None:
        return None

    merged_parameters = _merge_task_classifier_parameters(merged_parameters, task_type_payload)
    task_type = _normalize_task_type(task_type_payload.get("task_type"), "")
    task_confidence = float(task_type_payload.get("confidence", search_confidence))
    normalized_intent = _derive_intent_from_plan(search_strategy, task_type)
    confidence = min(search_confidence, task_confidence)
    return IntentResult(
        intent=normalized_intent,
        search_strategy=search_strategy,
        task_type=task_type,
        parameters=merged_parameters,
        search_result=search_result,
        confidence=confidence,
        classification_source="llm_agent1_agent2",
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

def _format_retrieved_docs_section(results: list[dict[str, Any]]) -> str:
    if not results:
        return ""

    lines = ["", "Retrieved documents:"]
    for item in results:
        title = item.get("title") or "Untitled"
        doc_id = item.get("id") or ""
        lines.append(f"- {title} (ID: {doc_id})")
    return "\n".join(lines)


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


def _summarize_chunk_result_for_log(result: dict[str, Any]) -> dict[str, Any]:
    source = result.get("source", {})
    return {
        "id": result.get("id"),
        "document_id": source.get("document_id", ""),
        "chunk_index": source.get("chunk_index"),
        "score": result.get("score"),
        "title": source.get("title", "Untitled"),
        "folder_name": source.get("folder_name", ""),
        "folder_path": source.get("folder_path", ""),
        "created_at": source.get("created_at", ""),
    }


def _build_document_sources_from_chunk_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    document_sources: list[dict[str, Any]] = []
    for item in results:
        source = item.get("source", {})
        document_id = str(source.get("document_id") or "").strip()
        if not document_id or document_id in seen:
            continue
        seen.add(document_id)
        document_sources.append(
            {
                "id": document_id,
                "score": item.get("score"),
                "title": source.get("title", "Untitled"),
                "folder_name": source.get("folder_name", ""),
                "folder_path": source.get("folder_path", ""),
                "created_at": source.get("created_at", ""),
            }
        )
    return document_sources


def _build_chunk_rag_context(results: list[dict[str, Any]], max_chars_per_chunk: int = 1000) -> str:
    sections: list[str] = []
    for index, item in enumerate(results, start=1):
        source = item.get("source", {})
        title = source.get("title", "Untitled")
        doc_id = source.get("document_id", "")
        chunk_index = source.get("chunk_index", "")
        score = item.get("score")
        folder_name = source.get("folder_name", "")
        folder_path = source.get("folder_path", "")
        created_at = source.get("created_at", "")
        chunk_text = source.get(CHUNK_TEXT_FIELD, "") or source.get("chunk_text", "")
        chunk_text = (chunk_text or "")[:max_chars_per_chunk]
        sections.append(
            "\n".join(
                [
                    f"Chunk {index}",
                    f"Chunk ID: {item.get('id', '')}",
                    f"Document ID: {doc_id}",
                    f"Chunk Index: {chunk_index}",
                    f"Title: {title}",
                    f"Score: {score}",
                    f"Folder Name: {folder_name}",
                    f"Folder Path: {folder_path}",
                    f"Created At: {created_at}",
                    f"Content: {chunk_text}",
                ]
            )
        )
    return "\n\n---\n\n".join(sections)

# ---------------------------------------------------------------------------
# Intent classifier agent
# ---------------------------------------------------------------------------

class IntentClassifier:
    @staticmethod
    async def classify(question: str) -> IntentResult:
        # Step 2: classify the user question into the best backend task.
        parameters = build_search_parameters(question)

        try:
            intent_result = await _classify_intent_with_llm(question, parameters)
            if intent_result is not None:
                _log_classification_result(question, intent_result)
                return intent_result
        except Exception as e:
            logger.warning(f"Intent classifier LLM failed: {e}, falling back to general_rag_qa")

        result = IntentResult(
            intent=IntentType.GENERAL_RAG_QA,
            search_strategy=SearchStrategy.HYBRID_SEARCH,
            task_type=TaskType.ANSWER_QUESTION,
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
        _log_search_body("OpenSearch _execute_search body", SEARCH_INDEX_NAME, body)
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
        _log_search_body("OpenSearch _execute_raw_search body", SEARCH_INDEX_NAME, body)
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


def _execute_chunk_search(query_text: str, parameters: dict[str, Any] | None = None, top_k: int = 5) -> dict:
    params = parameters or {}
    query = (params.get("query") or query_text or "").strip()
    if not query:
        return {"total": 0, "results": []}

    # Reuse existing filter semantics from document search for consistency.
    effective_filters = _extract_parameter_filters(params)
    req = SearchRequest(
        q=query,
        search_mode="text",
        page=1,
        per_page=max(10, top_k),
        **effective_filters,
    )
    filter_clauses = _build_filter_clauses(req, {}) if effective_filters else []

    text_fields = [f"{CHUNK_TEXT_FIELD}^2", "title", "metadata_text", "folder_name", "folder_path"]
    body: dict[str, Any] = {
        "from": 0,
        "size": max(10, top_k),
        "highlight": {
            "fields": {
                CHUNK_TEXT_FIELD: {"type": "unified", "number_of_fragments": 3, "fragment_size": 260},
                "title": {},
                "metadata_text": {},
                "folder_path": {},
            }
        },
    }

    embedder = _get_embedding_model()
    if embedder is False:
        text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields}}
        if filter_clauses:
            text_query = {"bool": {"must": [text_query], "filter": filter_clauses}}
        body["query"] = text_query
    else:
        query_embedding = embedder.encode(f"query: {query}", normalize_embeddings=True).tolist()
        text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields}}
        if filter_clauses:
            text_query = {
                "bool": {
                    "must": [{"multi_match": {"query": query, "fields": text_fields}}],
                    "filter": filter_clauses,
                }
            }
        knn_query: dict[str, Any] = {"knn": {CHUNK_VECTOR_FIELD: {"vector": query_embedding, "k": max(50, top_k * 6)}}}
        if filter_clauses:
            knn_query["knn"][CHUNK_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}
        body["query"] = {"hybrid": {"queries": [text_query, knn_query]}}
        body["search_pipeline"] = "rrf-pipeline"

    try:
        _log_search_body("OpenSearch _execute_chunk_search body", CHUNK_SEARCH_INDEX_NAME, body)
        _log_verbose("_execute_chunk_search request", {"index": CHUNK_SEARCH_INDEX_NAME, "query": query, "top_k": top_k, "body": body})
        res = es.search(index=CHUNK_SEARCH_INDEX_NAME, body=body)
        hits_obj = res.get("hits", {})
        hits = hits_obj.get("hits", [])
        total_obj = hits_obj.get("total", 0)
        total = total_obj.get("value", 0) if isinstance(total_obj, dict) else int(total_obj or 0)
        results = []
        for hit in hits:
            source = hit.get("_source", {})
            results.append(
                {
                    "id": hit.get("_id"),
                    "score": hit.get("_score"),
                    "source": source,
                    "highlight": hit.get("highlight", {}),
                }
            )
        _log_verbose("_execute_chunk_search response", {"index": CHUNK_SEARCH_INDEX_NAME, "total": total, "returned": len(results)})
        return {
            "total": total,
            "results": results,
        }
    except Exception as exc:
        logger.exception("_execute_chunk_search failed")
        return {"total": 0, "results": [], "error": str(exc)}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def orchestrate_agent_chat(question: str, chat_id: Optional[str] = None) -> dict:
    # Step 1: accept the request and determine which backend task should handle it.
    intent_result = await IntentClassifier.classify(question)
    intent = intent_result.intent
    search_strategy = intent_result.search_strategy
    params = intent_result.parameters
    prefetched_search_result = await _resolve_search_result(question, intent_result)
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
            agent_result = prefetched_search_result or await KeywordSearchAgent.execute(question, parameters=params)
            if agent_result.get("results"):
                answer = f"Found {agent_result['total']} documents matching your keyword search.\nTop results:\n"
                for r in agent_result["results"][:5]:
                    title = r["source"].get("title", "Untitled")
                    answer += f"- {title} (ID: {r['id']})\n"
            else:
                answer = "No documents found for your keyword search."
            response_payload = {"answer": answer, "search_results": agent_result}

        elif intent == IntentType.SEMANTIC_SEARCH:
            agent_result = prefetched_search_result or await SemanticSearchAgent.execute(question, parameters=params)
            if agent_result.get("results"):
                answer = f"Found {agent_result['total']} similar cases.\nMost relevant:\n"
                for r in agent_result["results"][:5]:
                    title = r["source"].get("title", "Untitled")
                    answer += f"- {title} (ID: {r['id']}, score: {r['score']:.2f})\n"
            else:
                answer = "No similar cases found."
            response_payload = {"answer": answer, "search_results": agent_result}

        elif intent == IntentType.STATS_COUNT:
            agent_result = prefetched_search_result or await _execute_search_strategy(question, params, search_strategy)
            answer = f"Number of documents: {agent_result.get('total', 0)}"
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
            agent_result = await MixedSearchSummaryAgent.execute(
                question,
                parameters=params,
                search_strategy=search_strategy,
                search_result=prefetched_search_result,
            )
            if "summary" in agent_result:
                answer = agent_result["summary"]
            else:
                answer = agent_result.get("error", "No results to summarize.")
            response_payload = {"answer": answer, "mixed_result": agent_result}

        elif intent == IntentType.FREE_OPEN_CHAT:
            agent_result = _generate_completion(resolved_chat_id, question, system_prompt=OPEN_CHAT_SYSTEM_PROMPT)
            answer = agent_result["answer"]
            response_payload = {
                "answer": answer,
                "token_usage": agent_result.get("token_usage", {}),
                "search_results": [],
                "sources": [],
            }

        else:  # GENERAL_RAG_QA
            agent_result = await RagAnswerAgent.execute(
                question,
                resolved_chat_id,
                params,
                search_strategy=search_strategy,
                search_result=prefetched_search_result,
            )
            answer = agent_result["answer"]
            response_payload = {
                "answer": answer,
                "token_usage": agent_result.get("token_usage", {}),
                "search_results": agent_result.get("search_results", []),
                "sources": agent_result.get("sources", []),
            }

        if intent not in {IntentType.GENERAL_RAG_QA, IntentType.FREE_OPEN_CHAT}:
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
                "ocr_content": {"type": "unified", "number_of_fragments": 3, "fragment_size": 300},
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
            if req.exact_phrase:
                text_clause: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields, "type": "phrase", "slop": 2}}
            else:
                text_clause = {"multi_match": {"query": query, "fields": text_fields}}
            if filter_clauses:
                body["query"] = {"bool": {"must": [text_clause], "filter": filter_clauses}}
            else:
                body["query"] = text_clause
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

    print("search body:", json.dumps(body, indent=2))
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

    # Housekeeping: remove chatbot index entries whose document no longer exists
    # in dms-documents.
    try:
        url = f"{DMS_BASE_URL}/api/chatbot/index/housekeeping"
        resp = requests.post(url, timeout=30)
        if resp.ok:
            result = resp.json()
            logger.info(
                "Chatbot index housekeeping complete: scanned=%s deleted=%s | chunk_scanned=%s chunk_deleted=%s",
                result.get("scanned", "?"),
                result.get("deleted", "?"),
                result.get("chunkScanned", "?"),
                result.get("chunkDeleted", "?"),
            )
        else:
            logger.warning(
                "Chatbot index housekeeping returned HTTP %s: %s",
                resp.status_code,
                resp.text[:200],
            )
    except Exception as exc:
        # Non-fatal: log and continue startup.
        logger.warning("Chatbot index housekeeping skipped: %s", exc)

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "search_index": SEARCH_INDEX_NAME,
        "chunk_search_index": CHUNK_SEARCH_INDEX_NAME,
        "chat_log_index": CHAT_LOG_INDEX,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "chunk_vector_field": CHUNK_VECTOR_FIELD,
        "chunk_text_field": CHUNK_TEXT_FIELD,
        "llm_model": LLM_MODEL,
    }

@app.post("/api/chatbot/search")
def search(req: SearchRequest) -> dict[str, Any]:
    try:
        body, date_filter = _build_search_body(req)
        _log_search_body("OpenSearch /api/chatbot/search body", SEARCH_INDEX_NAME, body)
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
                _log_search_body("OpenSearch /api/chatbot/search fallback body", SEARCH_INDEX_NAME, body)
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
        intent_result = await IntentClassifier.classify(req.question)
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

