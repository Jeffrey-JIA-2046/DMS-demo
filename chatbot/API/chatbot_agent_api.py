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
import calendar
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4
from enum import Enum
from copy import deepcopy

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
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
DEFAULT_SEARCH_PIPELINE_NAME = "rrf-pipeline-dms-3" if SEARCH_INDEX_NAME == "dms-documents-chatbot" else "rrf-pipeline-dms"
SEARCH_PIPELINE_NAME = os.getenv("CHATBOT_SEARCH_PIPELINE_NAME", DEFAULT_SEARCH_PIPELINE_NAME)
DEFAULT_CHUNK_SEARCH_INDEX_NAME = "dms-documents-chatbot-chunks-a"
CHUNK_SEARCH_INDEX_NAME = (
    os.getenv("CHATBOT_CHUNK_SEARCH_INDEX_NAME")
    or os.getenv("SEARCH_CHUNK_INDEX_NAME")
    or DEFAULT_CHUNK_SEARCH_INDEX_NAME
)
CHUNK_SEARCH_PIPELINE_NAME = os.getenv("CHATBOT_CHUNK_SEARCH_PIPELINE_NAME", "rrf-pipeline-dms-4")
SEARCH_PREFERENCE = os.getenv("CHATBOT_SEARCH_PREFERENCE", "rag-debug-fixed").strip()
CHUNK_SEARCH_PREFERENCE = os.getenv("CHATBOT_CHUNK_SEARCH_PREFERENCE", SEARCH_PREFERENCE).strip()
DEFAULT_OCR_DOCUMENT_INDEX_NAME = "dms-ocr-document"
OCR_DOCUMENT_INDEX_NAME = (
    os.getenv("CHATBOT_OCR_DOCUMENT_INDEX_NAME")
    or os.getenv("OCR_DOCUMENT_INDEX_NAME")
    or DEFAULT_OCR_DOCUMENT_INDEX_NAME
)
CHAT_LOG_INDEX = os.getenv("CHAT_LOG_INDEX", "chat_logs_dms")
TITLE_VECTOR_FIELD = os.getenv("SEARCH_TITLE_VECTOR_FIELD", "chatbot_title_embedding")
CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")
CHUNK_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_VECTOR_FIELD", "chunk_embedding")
CHUNK_TEXT_FIELD = os.getenv("SEARCH_CHUNK_TEXT_FIELD", "chunk_text")
CHUNK_TITLE_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_TITLE_VECTOR_FIELD", "title_embedding")
CHUNK_CONTENT_VECTOR_FIELD = os.getenv("SEARCH_CHUNK_CONTENT_VECTOR_FIELD", "chatbot_ocr_content_embedding")

LLM_API = os.getenv("LLM_API", "http://localhost:11434/api/chat")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-r1:32b")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").strip().lower()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
LLM_TOP_P = float(os.getenv("LLM_TOP_P", "0.7"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "2048"))
CLASSIFIER_TIMEOUT_SECONDS = int(os.getenv("CHATBOT_CLASSIFIER_TIMEOUT_SECONDS", "30"))
STATS_CLASSIFIER_TIMEOUT_SECONDS = int(os.getenv("CHATBOT_STATS_CLASSIFIER_TIMEOUT_SECONDS", "90"))

# DMS Java backend base URL used for housekeeping and other backend calls.
DMS_BASE_URL = os.getenv("DMS_BASE_URL", "http://localhost:8080")

MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", "30000"))
WARNING_THRESHOLD = int(os.getenv("WARNING_THRESHOLD", "16000"))
VERBOSE_LOGS = os.getenv("CHATBOT_VERBOSE_LOGS", "false").lower() == "true"
DEBUG_SEARCH_BODY = os.getenv("CHATBOT_DEBUG_SEARCH_BODY", "true").lower() == "true"
DEBUG_SEARCH_BODY_FILE = os.getenv("CHATBOT_DEBUG_SEARCH_BODY_FILE", "./debug_search_body.json")
RAG_LLM_TOP_K = int(os.getenv("CHATBOT_RAG_LLM_TOP_K", "10"))
RAG_MAX_SELECTED_PAGES = int(os.getenv("CHATBOT_RAG_MAX_SELECTED_PAGES", "20"))
RAG_MAX_PAGES_PER_DOCUMENT = int(os.getenv("CHATBOT_RAG_MAX_PAGES_PER_DOCUMENT", "5"))

_raw_origins = os.getenv("CHATBOT_CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [x.strip() for x in _raw_origins.split(",") if x.strip()]

# Lazy-loaded optional embedding model
_embedding_model = None
_ocr_pages_cache: dict[str, dict[int, str]] = {}


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
        "temperature": payload.get("temperature"),
        "top_p": payload.get("top_p"),
        "max_tokens": payload.get("max_tokens"),
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
    usage = payload.get("usage", {}) if isinstance(payload.get("usage"), dict) else {}
    return {
        "model": payload.get("model"),
        "done": payload.get("done"),
        "done_reason": payload.get("done_reason"),
        "content_preview": _preview_text(_extract_assistant_content(payload)),
        "prompt_eval_count": payload.get("prompt_eval_count"),
        "eval_count": payload.get("eval_count"),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "total_duration": payload.get("total_duration"),
    }


def _resolved_llm_provider() -> str:
    if LLM_PROVIDER in {"ollama", "vllm", "openai"}:
        return LLM_PROVIDER
    if "/v1/chat/completions" in (LLM_API or ""):
        return "vllm"
    return "ollama"


def _build_llm_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    return headers


def _extract_assistant_content(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""

    message = payload.get("message")
    if isinstance(message, dict):
        return str(message.get("content") or "")

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message_obj = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message_obj.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(str(block.get("text") or ""))
            return "".join(parts)
        return str(content or "")

    return ""


def _extract_stream_chunk_and_done(data: dict[str, Any], provider: str) -> tuple[str, bool]:
    if provider in {"vllm", "openai"}:
        choices = data.get("choices") if isinstance(data.get("choices"), list) else []
        if not choices:
            return "", False
        choice0 = choices[0] if isinstance(choices[0], dict) else {}
        delta = choice0.get("delta") if isinstance(choice0.get("delta"), dict) else {}
        chunk = str(delta.get("content") or "")
        done = bool(choice0.get("finish_reason") is not None)
        return chunk, done

    chunk = str(((data.get("message") or {}) if isinstance(data.get("message"), dict) else {}).get("content") or "")
    done = bool(data.get("done") is True)
    return chunk, done


def _build_classifier_payload(prompt: str) -> dict[str, Any]:
    provider = _resolved_llm_provider()
    if provider in {"vllm", "openai"}:
        return {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "temperature": 0,
            "top_p": 1,
            "max_tokens": 2048,
        }

    return {
        "model": LLM_MODEL,
        "stream": False,
        "think": False,
        "messages": [
            {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "parameters": {"temperature": 0},
    }


def _build_reduced_payload_for_retry(payload: dict[str, Any], provider: str) -> dict[str, Any]:
    retry_payload = deepcopy(payload)
    if provider in {"vllm", "openai"}:
        retry_payload.pop("max_tokens", None)
        retry_payload.pop("top_p", None)
    else:
        parameters = retry_payload.get("parameters")
        if isinstance(parameters, dict):
            parameters.pop("max_tokens", None)
            parameters.pop("top_p", None)
    return retry_payload


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
    # Keep this file focused on the chunk retrieval body used for RAG answer generation.
    if label != "OpenSearch _execute_chunk_search body":
        return

    try:
        file_path = os.path.abspath(DEBUG_SEARCH_BODY_FILE)
        parent_dir = os.path.dirname(file_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as handle:
            json.dump(body, handle, ensure_ascii=False, indent=2)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to write search body debug JSON file")


def _build_search_request_kwargs(preference: str | None = None) -> dict[str, Any]:
    resolved_preference = (preference or "").strip()
    if not resolved_preference:
        return {}
    return {"params": {"preference": resolved_preference}}

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
    category: list[str] = Field(default_factory=list)
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
    include_neighbor_pages: bool = False
    statistics_generation: bool = False

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
#     search_mode  : "hybrid"  (multi_match + two knn queries via rrf-pipeline-dms)
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
    HYBRID_SEARCH = "hybrid_search"     # uses vector knn + BM25 via rrf-pipeline-dms
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
    "category",
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
        "category": parameters.get("category", []),
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
    Executes a hybrid vector + BM25 search via OpenSearch's rrf-pipeline-dms.

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
      "search_pipeline": "rrf-pipeline-dms"   ← reciprocal-rank fusion
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
            search_kwargs = _build_search_request_kwargs(SEARCH_PREFERENCE)
            res = es.search(index=SEARCH_INDEX_NAME, body=body, **search_kwargs)
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
        top_k: int = RAG_LLM_TOP_K,
        include_neighbor_pages: bool = False,
    ) -> dict:
        # Step 4: retrieve top chunks, then map to unique pages/documents for grounded answering.
        params = parameters or {}
        _log_verbose("RagAnswerAgent.execute invoked", {"question": question, "chat_id": chat_id, "parameters": params, "top_k": top_k})
        chunk_search_result = _execute_chunk_search(
            question,
            params,
            top_k=top_k,
            search_strategy=search_strategy,
        )
        all_chunk_hits = chunk_search_result.get("results", []) or []
        logger.info(
            "Step 4: Chunk retrieval returned=%s; selected_top_k=%s for LLM context",
            len(all_chunk_hits),
            top_k,
        )
        chunk_hits = all_chunk_hits[:top_k]
        _log_top_chunk_hits(question, chunk_hits, top_k)
        chunk_page_map = _collect_chunk_pages_by_document(
            chunk_hits,
            max_total_pages=RAG_MAX_SELECTED_PAGES,
            max_pages_per_document=RAG_MAX_PAGES_PER_DOCUMENT,
            include_neighbor_pages=include_neighbor_pages,
        )
        chunk_index_map = _collect_chunk_indices_by_document(chunk_hits)
        logger.info(
            "Step 4: Selected pages after budget | max_pages=%s selected=%s",
            RAG_MAX_SELECTED_PAGES,
            sum(len(pages) for pages in chunk_page_map.values()),
        )

        results = _hydrate_documents_from_chunk_hits(chunk_hits, limit=top_k)
        if not results:
            resolved_search_result = search_result or await _execute_search_strategy(question, params, search_strategy)
            results = resolved_search_result.get("results", [])[:top_k]

        if not results:
            return {
                "answer": "I could not find relevant documents to answer this question.",
                "search_results": [],
                "sources": [],
                "token_usage": {},
            }

        context = _build_page_aware_rag_context(results, chunk_page_map, chunk_index_map)
        rag_prompt = (
            f"""User question: {question}\n\n
            "Step 1 - Identify relevant sources: List which documents/pages contain information needed to answer the question. Skip documents that are clearly irrelevant.

            Step 2 - Answer the question: Based only on the sources you identified, provide a clear and direct answer. Include specific details like dates, amounts, and document references.

            Rules:
            - Only use information present in the documents
            - Do not make up or assume information
            - If information is missing or unclear, state what is missing
            - If simple math is needed (e.g., totals, differences), calculate it" 

            
            "Retrieved document context:\n"

            {context}\n\n"
            
            "If the answer is incomplete or uncertain, say what is missing.
            
            """
        )
        _log_workflow_step(
            4,
            "RAG retrieved documents",
            {
                "question": question,
                "doc_count": len(results),
                "docs": [_summarize_result_for_log(item) for item in results],
                "rag_prompt_preview": rag_prompt,
                "chunk_pages": {doc_id: sorted(list(pages)) for doc_id, pages in chunk_page_map.items()},
                "chunk_indices": {doc_id: sorted(list(indices)) for doc_id, indices in chunk_index_map.items()},
            },
            verbose_only=True,
        )
        completion = _generate_completion(chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        sources = _build_document_sources_with_pages(results, chunk_page_map, chunk_index_map)
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


'''
 INSTRUCTIONS - FOLLOW STRICTLY:
            1. FIRST, review ALL documents and pages in the context above thoroughly.
            2. SECOND, identify which documents/pages contain information relevant to answering the question.
            3. THIRD, extract and synthesize the relevant information from ALL relevant sources.
            4. FOURTH, provide a comprehensive answer based ONLY on the context.
            5. FINALLY, if the answer draws from multiple sources, cite them explicitly (e.g., "According to Document X..." or "On Page Y...").

            CRITICAL RULES:
            - Do NOT answer before reading all context, list the docs you have read from the retrieved context.
            - Do NOT skip or ignore any part of the context
            - If information is spread across multiple documents/pages, combine it
            - If the context contains conflicting information, acknowledge it
            - If the answer is incomplete even after reading all context, explicitly state what information is missing
            - Never invent information not present in the context
            
'''


async def _build_agent_stream(
    question: str,
    chat_id: Optional[str],
    intent_result: IntentResult,
    include_neighbor_pages: bool = False,
):
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
        answer = _format_document_titles_only(results, limit=10)
        sources = [_summarize_result_for_log(r) for r in results[:5]]
        return _wrap_stream_with_metadata(
            _stream_text_response(answer, resolved_chat_id, intent),
            intent,
            {"sources": sources, **classification_meta},
        )

    if intent == IntentType.SEMANTIC_SEARCH:
        agent_result = prefetched_search_result or await SemanticSearchAgent.execute(question, parameters=params)
        results = agent_result.get("results", [])
        answer = _format_document_titles_only(results, limit=10)
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
        rag_top_k = RAG_LLM_TOP_K
        chunk_search_result = _execute_chunk_search(
            question,
            params,
            top_k=rag_top_k,
            search_strategy=search_strategy,
        )
        all_chunk_hits = chunk_search_result.get("results", []) or []
        logger.info(
            "Step 4: Chunk retrieval returned=%s; selected_top_k=%s for LLM context",
            len(all_chunk_hits),
            rag_top_k,
        )
        chunk_hits = all_chunk_hits[:rag_top_k]
        _log_top_chunk_hits(question, chunk_hits, rag_top_k)
        chunk_page_map = _collect_chunk_pages_by_document(
            chunk_hits,
            max_total_pages=RAG_MAX_SELECTED_PAGES,
            max_pages_per_document=RAG_MAX_PAGES_PER_DOCUMENT,
            include_neighbor_pages=include_neighbor_pages,
        )
        chunk_index_map = _collect_chunk_indices_by_document(chunk_hits)
        logger.info(
            "Step 4: Selected pages after budget | max_pages=%s selected=%s",
            RAG_MAX_SELECTED_PAGES,
            sum(len(pages) for pages in chunk_page_map.values()),
        )

        results = _hydrate_documents_from_chunk_hits(chunk_hits, limit=rag_top_k)
        if not results:
            search_result = prefetched_search_result or await _execute_search_strategy(question, params, search_strategy)
            results = search_result.get("results", [])[:rag_top_k]

        if not results:
            return _stream_text_response(
                "I could not find relevant documents to answer this question.",
                resolved_chat_id,
                intent,
                classification_meta,
            )

        context = _build_page_aware_rag_context(results, chunk_page_map, chunk_index_map)
        rag_prompt = (
            f"""User question: {question}\n\n

           Instructions:
            1. Scan all documents to identify which contain information relevant to the question.
            2. From relevant documents, extract the specific facts, numbers, or details that answer the question.
            3. State your answer directly, including all specific details (numbers, dates, amounts) from the documents.
            4. Cite which document and page the information came from.
            5. **Select the most similar case**: If multiple cases are provided, compare them and identify which one is most factually and legally similar to the user's question. Justify your selection by explaining the similarities.
            6. **Focus on the selected case**: After identifying the most similar case, center your answer on it. Other cases may be mentioned briefly for comparison only, but the primary answer must be based on the selected case.
            7. **Quote the exact wording**: When you find a sentence or phrase that directly answers the user's question, quote it verbatim using quotation marks. 
            8. **Before citing a page number, you MUST look for the nearest "------[Page X:]" marker that appears BEFORE the quoted text in the provided context. Use that number.**
            9. **Do not mention unrelated documents or explain why they are not relevant, as this distracts from the answer.**


            Important:
            - Only use information from the provided documents
            - Have tables, you need to read the tables
            - **Double check you cite the correct page number** 
            - Include specific numbers and details in your answer — do not just say "refer to the document"
            - If the full answer is not available in the documents, state exactly what is missing
            - If information conflicts between documents, note the conflict
            **Prioritize Best-Effort Answering**: You MUST try your best to answer the user's question using the provided documents. Do not refuse to answer simply because an exact keyword match is missing.
            - - **If you find a relevant case that answers the user's query, focus your answer solely on that case. Do not mention unrelated documents or explain why they are not relevant, as this distracts from the answer.**
            

            Retrieved most relevant documents context:\n
            f"{context}\n\n"

            "Answer the question using only the context above. "
            "If the answer is incomplete or uncertain, say what is missing.
            """
        )
        _log_verbose(
            "_build_agent_stream RAG documents",
            {
                "question": question,
                "doc_count": len(results),
                "docs": [_summarize_result_for_log(item) for item in results],
                "chunk_pages": {doc_id: sorted(list(pages)) for doc_id, pages in chunk_page_map.items()},
                "chunk_indices": {doc_id: sorted(list(indices)) for doc_id, indices in chunk_index_map.items()},
            },
        )
        generator = _generate_completion_stream(resolved_chat_id, rag_prompt, system_prompt=RAG_SYSTEM_PROMPT)
        return _wrap_stream_with_metadata(
            generator,
            intent,
            {
                "sources": _build_document_sources_with_pages(results, chunk_page_map, chunk_index_map),
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

    result = await orchestrate_agent_chat(
        question,
        resolved_chat_id,
        include_neighbor_pages=include_neighbor_pages,
    )
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


def _resolve_classifier_category_list(classifier_payload: dict[str, Any], payload_filters: dict[str, Any], merged: dict[str, Any]) -> list[str]:
    """Resolve category from classifier payload and filters using singular key only."""
    return _normalize_classifier_string_list(
        classifier_payload.get(
            "category",
            payload_filters.get("category", merged.get("category", [])),
        )
    )


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


def _cleanup_statistics_query_text(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .,:;\n\t")
    if not text:
        return ""

    # Remove dangling trailing prepositions that degrade strict multi_match recall.
    text = re.sub(r"(?i)\b(in|for|of|on|at|to|from|with|by)\b(?=\s*$)", "", text)
    text = re.sub(r"\s+", " ", text).strip(" .,:;\n\t")
    return text


def _extract_statistics_query_and_date(question: str) -> tuple[str, str, str]:
    text = (question or "").strip()
    if not text:
        return "", "", ""

    working = text
    month_start_date = ""
    month_end_date = ""
    mentions_created_date = bool(re.search(r"(?i)\b(create|created|creation|created_at|create date)\b", text))
    mentions_modified_date = bool(re.search(r"(?i)\b(modify|modified|update|updated|updated_at|modify date|update date)\b", text))

    for month_name, month_number in MONTH_NAME_TO_NUMBER.items():
        month_pattern = rf"\b{month_name}\s+(\d{{4}})\b"
        match = re.search(month_pattern, working, flags=re.IGNORECASE)
        if not match:
            continue

        year_value = _safe_int(match.group(1))
        if year_value is None or year_value < 1900 or year_value > 2100:
            continue

        last_day = calendar.monthrange(year_value, month_number)[1]
        month_start_date = f"{year_value:04d}-{month_number:02d}-01"
        month_end_date = f"{year_value:04d}-{month_number:02d}-{last_day:02d}"
        working = re.sub(month_pattern, " ", working, flags=re.IGNORECASE)
        break

    relating_match = re.search(r"(?i)\b(relating to|about|regarding|on)\b\s*(.+)", working)
    if relating_match:
        working = relating_match.group(2)

    working = re.sub(r"(?i)\b(please|count|number of|documents?|how many|total|show me|tell me|give me)\b", " ", working)
    working = re.sub(r"(?i)\b(in|for|of)\s*$", " ", working)
    working = re.sub(r"\s+", " ", working).strip(" .,:;\n\t")

    query = _cleanup_statistics_query_text(working) or _cleanup_statistics_query_text(text)
    if mentions_created_date or mentions_modified_date:
        return query, month_start_date, month_end_date
    return query, "", ""


def _build_statistics_mode_prompt(question: str) -> str:
    return f"""Return JSON only.

You are extracting a statistics search plan for OpenSearch.

User question:
{question}

Rules:
- Return a search schema that follows Search documents condition style.
- You must fill conditions dynamically from the user question using semantic understanding.
- Do not copy hardcoded sample values into conditions.
- Conditions are required when the user provides any topic/entity/filter words; do not return an empty conditions array in that case.
- If the user asks for folder-like constraints, produce folderName or folderPath conditions.
- If the user asks for title/description/category/owner/tags/metadata constraints, produce matching field conditions.
- If multiple constraints are present, include multiple condition rows with proper AND/OR joins.
- Extract year_month_token as YYYY.MM when present or inferable from month+year text.
- If month/year is present (for example May 2025), include a condition row using value "YYYY.MM" with join "AND" to the topic condition.
- date_filter_field must be one of: created_at, updated_at, none.
- Use date_filter_field=created_at ONLY when user explicitly asks by created/create date semantics.
- Use date_filter_field=updated_at ONLY when user explicitly asks by modified/updated date semantics.
- If user does not mention created/updated semantics, set date_filter_field=none and leave start_date/end_date empty.
- start_date/end_date must be YYYY-MM-DD when date_filter_field is created_at/updated_at.

Example mapping:
- "Please count the number of documents relating to Bills Committee Meeting in May 2025"
    -> query="Bills Committee Meeting"
    -> year_month_token="2025.05"
    -> conditions includes at least:
         1) {{"field":"folderName","operator":"contains","value":"Bills Committee Meeting","group":0,"join":"AND"}}
         2) {{"field":"folderName","operator":"contains","value":"2025.05","group":0,"join":""}}

Condition rules:
- field supports: title, description, owner, category, tags, documentMetadata, folderName, folderPath, folderMetadata.
- operator supports: contains, not_contains, is, is_not, starts_with, ends_with.
- join supports: AND or OR.
- group is integer, default 0.
- If conditions are present, backend will convert them into OpenSearch bool clauses.

Response schema:
{{
  "query": "string",
    "conditions": [
        {{"field": "<field>", "operator": "<operator>", "value": "<value>", "group": 0, "join": "AND|OR|"}}
    ],
  "year_month_token": "YYYY.MM|",
  "date_filter_field": "created_at|updated_at|none",
  "start_date": "YYYY-MM-DD|",
  "end_date": "YYYY-MM-DD|",
  "confidence": 0.0
}}"""


def _normalize_statistics_conditions(values: Any) -> list[dict[str, Any]]:
    if not isinstance(values, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in values:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or "").strip()
        operator = str(item.get("operator") or "contains").strip().lower()
        value = str(item.get("value") or "").strip()
        if not field or not value:
            continue
        if field not in {
            "title",
            "description",
            "owner",
            "category",
            "tags",
            "documentMetadata",
            "folderName",
            "folderPath",
            "folderMetadata",
        }:
            continue
        if operator not in {"contains", "not_contains", "is", "is_not", "starts_with", "ends_with"}:
            operator = "contains"
        join = str(item.get("join") or "").strip().upper()
        if join not in {"AND", "OR"}:
            join = ""
        group = _safe_int(item.get("group"))
        normalized.append(
            {
                "field": field,
                "operator": operator,
                "value": value,
                "group": group if group is not None and group >= 0 else 0,
                "join": join,
            }
        )
    return normalized


def _enrich_statistics_conditions(
    conditions: list[dict[str, Any]],
    query: str,
    year_month_token: str,
) -> list[dict[str, Any]]:
    if conditions:
        return conditions

    enriched: list[dict[str, Any]] = []
    query_text = _cleanup_statistics_query_text(query)
    if query_text:
        enriched.append(
            {
                "field": "folderName",
                "operator": "contains",
                "value": query_text,
                "group": 0,
                "join": "AND" if year_month_token else "",
            }
        )
    if year_month_token:
        enriched.append(
            {
                "field": "folderPath",
                "operator": "contains",
                "value": year_month_token,
                "group": 0,
                "join": "",
            }
        )
    return enriched


def _build_statistics_condition_clause(condition: dict[str, Any]) -> dict[str, Any]:
    field = condition.get("field")
    operator = condition.get("operator")
    value = condition.get("value")
    if field == "folderPath":
        fields = ["folder_path", "folder_path.keyword"]
    elif field == "folderName":
        fields = ["folder.parent.name", "folder.parent.name.keyword", "folder_name", "folder_name.keyword"]
    elif field == "title":
        fields = ["title", "title.keyword"]
    elif field == "description":
        fields = ["description"]
    elif field == "owner":
        fields = ["owner", "owner.keyword"]
    elif field == "category":
        fields = ["category", "category.keyword"]
    elif field == "tags":
        fields = ["tags", "tags.keyword"]
    elif field == "documentMetadata":
        fields = ["metadata_text"]
    elif field == "folderMetadata":
        fields = ["metadata_text"]
    else:
        fields = ["folder.parent.name", "folder.parent.name.keyword", "folder_name", "folder_path"]

    effective_operator = "contains" if operator in {"not_contains", "is_not"} else operator

    if field == "folderName" and effective_operator == "contains":
        return {
            "bool": {
                "should": [
                    {"wildcard": {"folder_name.keyword": {"value": f"*{value}*"}}},
                    {"wildcard": {"folder_name": {"value": f"*{value}*"}}},
                ],
                "minimum_should_match": 1,
            }
        }

    if field == "folderPath" and effective_operator == "contains":
        return {
            "bool": {
                "should": [
                    {"wildcard": {"folder_path.keyword": {"value": f"*{value}*"}}},
                    {"wildcard": {"folder_path": {"value": f"*{value}*"}}},
                ],
                "minimum_should_match": 1,
            }
        }

    if effective_operator == "is":
        return {
            "multi_match": {
                "query": value,
                "fields": fields,
                "type": "phrase",
                "lenient": True,
            }
        }
    if effective_operator == "starts_with":
        return {
            "query_string": {
                "query": f"{value}*",
                "fields": fields,
                "default_operator": "AND",
            }
        }
    if effective_operator == "ends_with":
        return {
            "query_string": {
                "query": f"*{value}",
                "fields": fields,
                "default_operator": "AND",
            }
        }
    return {
        "multi_match": {
            "query": value,
            "fields": fields,
            "operator": "and",
            "lenient": True,
        }
    }


def _build_statistics_condition_bool(conditions: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not conditions:
        return None

    positive_clauses: list[dict[str, Any]] = []
    negative_clauses: list[dict[str, Any]] = []
    for item in conditions:
        clause = _build_statistics_condition_clause(item)
        if item.get("operator") in {"not_contains", "is_not"}:
            negative_clauses.append(clause)
        else:
            positive_clauses.append(clause)

    if not positive_clauses and not negative_clauses:
        return None

    joins = [item.get("join") for item in conditions]
    has_or = any(join == "OR" for join in joins[:-1])
    bool_query: dict[str, Any] = {}
    if has_or:
        if positive_clauses:
            bool_query["should"] = positive_clauses
            bool_query["minimum_should_match"] = 1
    else:
        if positive_clauses:
            bool_query["must"] = positive_clauses
    if negative_clauses:
        bool_query["must_not"] = negative_clauses
    return bool_query if bool_query else None


def _extract_statistics_plan_with_llm(question: str) -> dict[str, Any] | None:
    prompt = _build_statistics_mode_prompt(question)
    payload = _call_classifier_llm(
        prompt,
        stage="StatisticsMode",
        timeout_seconds=STATS_CLASSIFIER_TIMEOUT_SECONDS,
    )
    if not isinstance(payload, dict):
        # Retry once before failing statistics mode.
        payload = _call_classifier_llm(
            prompt,
            stage="StatisticsMode-Retry",
            timeout_seconds=STATS_CLASSIFIER_TIMEOUT_SECONDS,
        )
    if not isinstance(payload, dict):
        return None

    query = _cleanup_statistics_query_text(str(payload.get("query") or ""))
    year_month_token = str(payload.get("year_month_token") or "").strip()
    if not re.match(r"^\d{4}\.\d{2}$", year_month_token):
        year_month_token = ""

    date_filter_field_raw = str(payload.get("date_filter_field") or "none").strip().lower()
    date_filter_field = date_filter_field_raw if date_filter_field_raw in {"created_at", "updated_at", "none"} else "none"

    start_date = str(payload.get("start_date") or "").strip()
    end_date = str(payload.get("end_date") or "").strip()
    if date_filter_field == "none":
        start_date = ""
        end_date = ""

    valid_date_pattern = r"^\d{4}-\d{2}-\d{2}$"
    if start_date and not re.match(valid_date_pattern, start_date):
        start_date = ""
    if end_date and not re.match(valid_date_pattern, end_date):
        end_date = ""

    normalized_conditions = _normalize_statistics_conditions(payload.get("conditions"))
    normalized_conditions = _enrich_statistics_conditions(normalized_conditions, query, year_month_token)

    return {
        "query": query,
        "conditions": normalized_conditions,
        "year_month_token": year_month_token,
        "date_filter_field": date_filter_field,
        "start_date": start_date,
        "end_date": end_date,
        "confidence": payload.get("confidence"),
    }


def _extract_statistics_year_month_token(question: str, start_date: str) -> str:
    text = str(question or "")
    explicit_patterns = [
        r"\b(\d{4})[.\-/](\d{1,2})\b",
        r"\b(\d{4})\s*年\s*(\d{1,2})\s*月\b",
    ]
    for pattern in explicit_patterns:
        explicit = re.search(pattern, text)
        if not explicit:
            continue
        year_value = _safe_int(explicit.group(1))
        month_value = _safe_int(explicit.group(2))
        if (
            year_value is not None
            and 1900 <= year_value <= 2100
            and month_value is not None
            and 1 <= month_value <= 12
        ):
            return f"{year_value:04d}.{month_value:02d}"

    # Month name + year fallback (e.g. "May 2025").
    for month_name, month_number in MONTH_NAME_TO_NUMBER.items():
        month_match = re.search(rf"\b{month_name}\s+(\d{{4}})\b", text, flags=re.IGNORECASE)
        if not month_match:
            continue
        year_value = _safe_int(month_match.group(1))
        if year_value is not None and 1900 <= year_value <= 2100:
            return f"{year_value:04d}.{month_number:02d}"

    parsed_start = convert_to_es_date(start_date) if start_date else None
    if parsed_start and len(parsed_start) >= 7:
        return parsed_start[:7].replace("-", ".")
    return ""


def _map_statistics_field_to_dms_condition_field(field: str) -> str:
    normalized = str(field or "").strip()
    field_map = {
        "title": "title",
        "description": "description",
        "owner": "owner",
        "category": "category",
        "tags": "tags",
        "documentMetadata": "documentMetadata",
        "folderName": "folderName",
        "folderMetadata": "folderMetadata",
        # DMS Search panel does not expose folderPath as a condition field.
        # Use folderName as the closest behavior for matching folder-like text.
        "folderPath": "folderName",
    }
    return field_map.get(normalized, "title")


def _build_dms_documents_query_params(
    query: str,
    schema_conditions: list[dict[str, Any]],
    date_filter_field: str,
    start_date: str,
    end_date: str,
    page: int,
    size: int,
) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = [("page", str(max(0, int(page)))), ("size", str(max(1, int(size))))]

    cleaned_query = str(query or "").strip()
    # Match Search Documents panel behavior: when condition rows are present,
    # rely on conditions instead of sending an extra q term filter.
    if cleaned_query and not schema_conditions:
        params.append(("q", cleaned_query))

    if schema_conditions:
        params.append(("conditionOperator", "AND"))
        normalized_conditions = [
            condition
            for condition in schema_conditions
            if str(condition.get("value") or "").strip()
        ]

        for index, condition in enumerate(normalized_conditions):
            field = _map_statistics_field_to_dms_condition_field(str(condition.get("field") or ""))
            operator = str(condition.get("operator") or "contains").strip().lower()
            value = str(condition.get("value") or "").strip()

            if operator not in {"contains", "not_contains", "is", "is_not", "starts_with", "ends_with", "before", "after"}:
                operator = "contains"

            group_value = _safe_int(condition.get("group"))
            group = str(group_value if group_value is not None and group_value >= 0 else 0)
            join = str(condition.get("join") or "").strip().upper()
            if join not in {"AND", "OR"}:
                join = ""
            # Last condition must not carry a trailing join.
            if index == len(normalized_conditions) - 1:
                join = ""

            params.append(("conditionField", field))
            params.append(("conditionValue", value))
            params.append(("conditionOp", operator))
            params.append(("conditionGroup", group))
            params.append(("conditionJoin", join))

    date_field = "createdDate" if date_filter_field == "created_at" else ("modifiedDate" if date_filter_field == "updated_at" else "")
    if date_field and start_date and end_date and start_date == end_date:
        params.append(("conditionField", date_field))
        params.append(("conditionValue", start_date))
        params.append(("conditionOp", "is"))
        params.append(("conditionGroup", "0"))
        params.append(("conditionJoin", ""))
    elif date_field:
        if start_date:
            params.append(("conditionField", date_field))
            params.append(("conditionValue", start_date))
            params.append(("conditionOp", "after"))
            params.append(("conditionGroup", "0"))
            params.append(("conditionJoin", "AND" if end_date else ""))
        if end_date:
            params.append(("conditionField", date_field))
            params.append(("conditionValue", end_date))
            params.append(("conditionOp", "before"))
            params.append(("conditionGroup", "0"))
            params.append(("conditionJoin", ""))

    return params


def _extract_folder_path_from_dms_document(item: dict[str, Any]) -> str:
    folder = item.get("folder") if isinstance(item, dict) else {}
    if not isinstance(folder, dict):
        return ""
    breadcrumbs = folder.get("breadcrumbs") if isinstance(folder.get("breadcrumbs"), list) else []
    breadcrumb_parts = [str(part).strip() for part in breadcrumbs if str(part).strip()]
    folder_name = str(folder.get("name") or "").strip()
    if folder_name and (not breadcrumb_parts or breadcrumb_parts[-1] != folder_name):
        breadcrumb_parts.append(folder_name)
    if breadcrumb_parts:
        return " / ".join(breadcrumb_parts)
    return folder_name


def _dms_statistics_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    auth_header_name = str(os.getenv("DMS_API_AUTH_HEADER", "")).strip()
    auth_header_value = str(os.getenv("DMS_API_AUTH_VALUE", "")).strip()
    if auth_header_name and auth_header_value:
        headers[auth_header_name] = auth_header_value
    return headers


def _merge_dms_forward_headers(forwarded_headers: Optional[dict[str, str]]) -> dict[str, str]:
    headers = _dms_statistics_headers()
    if not isinstance(forwarded_headers, dict):
        return headers
    for header_name in ("Authorization", "Cookie", "X-Auth-Token", "X-CSRF-Token"):
        value = str(forwarded_headers.get(header_name) or "").strip()
        if value:
            headers[header_name] = value
    return headers


def _execute_statistics_metadata_search(question: str, forwarded_headers: Optional[dict[str, str]] = None) -> dict[str, Any]:
    llm_plan = _extract_statistics_plan_with_llm(question)
    if not isinstance(llm_plan, dict):
        raise HTTPException(
            status_code=504,
            detail=(
                "Statistics generation mode requires LLM planning, but the LLM request timed out or failed. "
                "Please retry or increase CHATBOT_STATS_CLASSIFIER_TIMEOUT_SECONDS."
            ),
        )
    fallback_query, fallback_start_date, fallback_end_date = _extract_statistics_query_and_date(question)

    query = _cleanup_statistics_query_text(str((llm_plan or {}).get("query") or fallback_query or ""))
    date_filter_field = str((llm_plan or {}).get("date_filter_field") or "none").strip().lower()
    if date_filter_field not in {"created_at", "updated_at", "none"}:
        date_filter_field = "none"

    start_date = str((llm_plan or {}).get("start_date") or "").strip()
    end_date = str((llm_plan or {}).get("end_date") or "").strip()
    if date_filter_field == "none":
        start_date = ""
        end_date = ""
    elif not start_date and not end_date:
        start_date = fallback_start_date
        end_date = fallback_end_date

    year_month_token = str((llm_plan or {}).get("year_month_token") or "").strip()
    if not year_month_token:
        year_month_token = _extract_statistics_year_month_token(question, start_date)
    if not year_month_token:
        year_month_token = _extract_statistics_year_month_token(query, start_date)
    schema_conditions = _normalize_statistics_conditions((llm_plan or {}).get("conditions"))
    schema_conditions = _enrich_statistics_conditions(schema_conditions, query, year_month_token)

    base_params = _build_dms_documents_query_params(
        query=query,
        schema_conditions=schema_conditions,
        date_filter_field=date_filter_field,
        start_date=start_date,
        end_date=end_date,
        page=0,
        size=200,
    )
    dms_request_debug = {
        "url": f"{DMS_BASE_URL}/api/documents",
        "params": base_params,
        "headers": sorted(_merge_dms_forward_headers(forwarded_headers).keys()),
    }

    logger.info(
        "Step 3: Statistics DMS request params (full)\n%s",
        json.dumps(dms_request_debug, ensure_ascii=False, indent=2),
    )

    _log_workflow_step(
        3,
        "Statistics DMS request",
        {
            "url": f"{DMS_BASE_URL}/api/documents",
            "query_text": query,
            "llm_plan": llm_plan,
            "schema_conditions": schema_conditions,
            "date_filter_field": date_filter_field,
            "year_month_token": year_month_token,
            "start_date": start_date,
            "end_date": end_date,
            "params": base_params,
        },
    )

    url = f"{DMS_BASE_URL}/api/documents"
    headers = _merge_dms_forward_headers(forwarded_headers)
    try:
        first_response = requests.get(url, params=base_params, headers=headers, timeout=60)
    except requests.RequestException as exc:
        logger.exception("Statistics DMS request failed")
        raise HTTPException(status_code=502, detail=f"Statistics DMS request failed: {exc}") from exc

    if not first_response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Statistics DMS request failed with HTTP {first_response.status_code}: {first_response.text[:300]}",
        )

    page_payload = first_response.json() if first_response.text else {}
    total_docs = int(page_payload.get("totalElements") or 0)
    total_pages = int(page_payload.get("totalPages") or 0)
    all_documents: list[dict[str, Any]] = list(page_payload.get("content") or [])

    for page_index in range(1, max(0, total_pages)):
        page_params = _build_dms_documents_query_params(
            query=query,
            schema_conditions=schema_conditions,
            date_filter_field=date_filter_field,
            start_date=start_date,
            end_date=end_date,
            page=page_index,
            size=200,
        )
        try:
            page_resp = requests.get(url, params=page_params, headers=headers, timeout=60)
        except requests.RequestException as exc:
            logger.warning("Statistics DMS pagination request failed on page %s: %s", page_index, exc)
            continue
        if not page_resp.ok:
            logger.warning(
                "Statistics DMS pagination request returned HTTP %s on page %s",
                page_resp.status_code,
                page_index,
            )
            continue
        page_json = page_resp.json() if page_resp.text else {}
        all_documents.extend(list(page_json.get("content") or []))

    folder_paths: list[str] = []
    for item in all_documents:
        folder_path = _extract_folder_path_from_dms_document(item)
        if folder_path:
            folder_paths.append(folder_path)

    unique_paths = {path for path in folder_paths if path}
    subfolder_count = len(unique_paths)
    top_folder_path = ""
    folder_document_counts: list[dict[str, Any]] = []
    if folder_paths:
        counts: dict[str, int] = {}
        for path in folder_paths:
            counts[path] = counts.get(path, 0) + 1
        sorted_counts = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        top_folder_path = sorted_counts[0][0]
        folder_document_counts = [
            {"folder_path": path, "document_count": count}
            for path, count in sorted_counts
        ]

    if total_docs <= 0:
        answer = "No matching documents were found for statistics generation."
    elif folder_document_counts:
        folder_lines = "\n".join(
            [
                f"- {item.get('folder_path', '')} ({item.get('document_count', 0)} documents)"
                for item in folder_document_counts
            ]
        )
        answer = (
            f"A total of {total_docs} documents are contained in {subfolder_count} sub-folders.\n"
            f"Folders:\n{folder_lines}"
        )
    else:
        answer = f"A total of {total_docs} documents are contained in {subfolder_count} sub-folders."

    _log_workflow_step(
        4,
        "Statistics DMS response",
        {
            "total_documents": total_docs,
            "subfolder_count": subfolder_count,
            "top_folder_path": top_folder_path,
            "response_schema": {
                "answer": "string",
                "total_documents": "int",
                "subfolder_count": "int",
                "top_folder_path": "string",
                "folder_document_counts": "list[{folder_path, document_count}]",
                "query": "string",
                "date_filter_field": "created_at|updated_at|none",
                "year_month_token": "string",
                "start_date": "string",
                "end_date": "string",
            },
        },
    )

    return {
        "answer": answer,
        "total_documents": total_docs,
        "subfolder_count": subfolder_count,
        "top_folder_path": top_folder_path,
        "folder_document_counts": folder_document_counts,
        "query": query,
        "conditions": schema_conditions,
        "date_filter_field": date_filter_field,
        "year_month_token": year_month_token,
        "start_date": start_date,
        "end_date": end_date,
        "dms_request": dms_request_debug,
    }


def _run_statistics_generation(
    question: str,
    chat_id: Optional[str],
    forwarded_headers: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    resolved_chat_id = chat_id or str(uuid4())
    stats = _execute_statistics_metadata_search(question, forwarded_headers=forwarded_headers)
    answer = stats.get("answer", "No statistics were generated.")
    classification = {
        "question": question,
        "intent": IntentType.STATS_COUNT.value,
        "search_strategy": SearchStrategy.KEYWORD_SEARCH.value,
        "task_type": TaskType.ANSWER_QUESTION.value,
        "confidence": 1.0,
        "classification_source": "statistics_generation_mode",
        "search_template": {
            "query": stats.get("query", ""),
            "start_date": stats.get("start_date", ""),
            "end_date": stats.get("end_date", ""),
        },
    }
    payload = {
        "messages": [{"role": "user", "content": question}],
        # Avoid indexing empty date strings into date-mapped fields in chat_logs_dms.
        "statistics": {
            key: value
            for key, value in stats.items()
            if not (key in {"start_date", "end_date"} and isinstance(value, str) and not value.strip())
        },
        "mode": "statistics_generation",
    }
    token_usage = _build_token_usage(payload["messages"], answer, None)
    _save_chat_log(resolved_chat_id, payload, answer, token_usage)
    result = {
        "chat_id": resolved_chat_id,
        "answer": answer,
        "intent": IntentType.STATS_COUNT.value,
        "classification": classification,
        "debug_info": {"statistics": stats},
    }
    _log_workflow_step(
        6,
        "Statistics generation response schema",
        {
            "keys": sorted(list(result.keys())),
            "classification_keys": sorted(list((result.get("classification") or {}).keys())),
            "debug_info_keys": sorted(list((result.get("debug_info") or {}).keys())),
        },
    )
    return result


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
    merged["category"] = _resolve_classifier_category_list(classifier_payload, payload_filters, merged)
    merged.pop("categories", None)
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
    normalized_value = str(strategy_value or "").strip()
    if normalized_value in {member.value for member in SearchStrategy}:
        strategy = SearchStrategy(normalized_value)
        if strategy == SearchStrategy.NO_SEARCH:
            return SearchStrategy.NO_SEARCH
        return SearchStrategy.HYBRID_SEARCH

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


def _call_classifier_llm(
    prompt: str,
    stage: str = "classifier",
    timeout_seconds: int | None = None,
) -> dict[str, Any] | None:
    logger.info("Step 2: %s prompt sent to LLM\n%s", stage, prompt)
    resolved_timeout = timeout_seconds if isinstance(timeout_seconds, int) and timeout_seconds > 0 else CLASSIFIER_TIMEOUT_SECONDS
    payload = _build_classifier_payload(prompt)
    try:
        response = requests.post(
            LLM_API,
            json=payload,
            headers=_build_llm_headers(),
            timeout=resolved_timeout,
        )
    except requests.exceptions.Timeout:
        logger.warning("Step 2: %s classifier timed out after %ss", stage, resolved_timeout)
        return None
    except requests.exceptions.RequestException as exc:
        logger.warning("Step 2: %s classifier request failed: %s", stage, exc)
        return None

    if not response.ok:
        logger.warning("Intent classifier LLM returned HTTP %s", response.status_code)
        return None

    data = response.json()
    raw_content = _extract_assistant_content(data)
    if stage == "Agent2":
        logger.info("Step 2: Agent2 raw response from LLM\n%s", raw_content)
    if stage.startswith("StatisticsMode"):
        logger.info("Step 2: %s raw response from LLM\n%s", stage, raw_content)

    content = re.sub(r'```json\s*|\s*```', '', str(raw_content).strip())
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning("Step 2: %s response JSON parse failed: %s | raw=%s", stage, exc, raw_content)
        return None

    if stage == "Agent2":
        logger.info("Step 2: Agent2 parsed response | %s", _truncate_for_log(parsed))
    if stage.startswith("StatisticsMode"):
        logger.info("Step 2: %s parsed response | %s", stage, _truncate_for_log(parsed))

    return parsed


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
- Choose exactly one search_strategy: hybrid_search(most likely!!),  or no_search.
- **Can use the hybrid search then use the hybrid search. Hybrid search is the first choice.(important)**
- hybrid_search means normal document retrieval using the same search template fields as chatbot-template__filters-section and chatbot_api.py.
- no_search means the question is a free open question and does not need document retrieval.
- Do not decide the final task type here.
- Do not extract with hardcoded patterns; use the user meaning.
- Fill start_date, end_date, owners, category, tags, folder_names, folder_paths, and metadata_filters when the user clearly specifies filters.
- category is optional. If the user does not specify category, return "category": [].
- When user mentions category names, map them to these internal codes in "category":
    * Corporate Secretarial Documents -> CORP_SEC
    * Form -> FORM
    * LC paper -> LC_PAPER
    * License Documents -> LIC
    * Minutes of Meeting -> MM
    * Reply letter -> RE_LETTER
- Do not return raw category labels in "category"; return only mapped codes.
- If the user gives a literal phrase, keep search_strategy as hybrid_search and put the phrase in "phrase" for downstream query rewriting.
- Use match_mode only when absolutely necessary; otherwise leave it null.
- If the only filter is a date, owner, category, folder, or tag (no keyword terms), use hybrid_search, not keyword_search.


Examples:
- Query: find similar cases; cases related to ; relevant ones
  Return: search_strategy="hybrid_search"
- Query: find the docs updated 18/4/2026
  Return: search_strategy="hybrid_search", start_date="2026-04-18", end_date="2026-04-18"
- Query: show documents created in March 2026
  Return: search_strategy="hybrid_search", start_date="2026-03-01", end_date="2026-03-31"


  

Response schema:
{{
    "search_strategy": "hybrid_search|no_search",
  "confidence": 0.0,
  "search_mode": "text|hybrid",
  "match_mode": "exact_phrase|all_terms|any_terms|null",
  "requires_exact_match": false,
  "doc_id": null,
  "start_date": "",
  "end_date": "",
    "owners": [],
    "category": [],
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



'''
Rules:
- Choose exactly one task_type: list_documents, answer_question.
- list_documents means the user mainly wants matched document candidates (titles/IDs), not synthesized content answers, just some keyword search
- answer_question means answer the user using searched documents, unless search_strategy=no_search.

- If the user asks for a summary, key points, brief explanation, compare/contrast, or synthesis, classify as answer_question.
- If the user asks to "list" documents and also asks for key points/summary, classify as answer_question.
- If the user asks a direct content question (for example "what does it say about...", "why", "how", "which policy", "summarize"), choose answer_question.
- If search_strategy is no_search, prefer answer_question.
- Use the search results preview to decide whether the user is asking for listing, answering, counting, or summarizing.

Examples:
- "list documents about land registration circulars" -> list_documents
- "show me files related to tenancy" -> list_documents
- "what do these tenancy documents say about notice period?" -> answer_question
- "summarize the key points of the retrieved documents" -> answer_question
- "how many documents mention currency" -> count_results

Response schema:
{{
  "task_type": "list_documents|answer_question",
  "confidence": 0.0,
  "doc_id": null,
  "requires_summary": false
}}"""

'''

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


Rules:
- Choose exactly one task_type: list_documents, answer_question.
- answer_question is the default choice.

- list_documents: Use ONLY when the user explicitly wants to SEE/BROWSE document titles/IDs/metadata without any content analysis, synthesis, or summarization. 
  * Keywords: "list", "show me", "display", "find documents" (without content requirements)
  * Example: "list documents about land registration" -> list_documents
  * Example: "show me files related to tenancy" -> list_documents

- answer_question: Use when the user wants to UNDERSTAND, ANALYZE, or GET INFORMATION from documents, including:
  * Looking for similar cases or precedents (even if they say "find a similar case")
  * Asking "what", "why", "how", "which" questions about content
  * Requesting summaries, key points, brief explanations, comparisons, or synthesis
  * Processing applications and seeking guidance from similar cases
  * Combining search with analysis (e.g., "find...please list the most relevant ones with key points summarized")
  * Finding cases with specific characteristics for decision support
  
  * Keywords: "similar case", "what does it say", "summarize", "key points", "brief explanation", "compare", "contrast", "process", "guidance"
  * Example: "I am processing a filing application... Please locate a similar case." -> answer_question
  * Example: "Find previous legal advice cases... Please list the most relevant ones with their key points summarized briefly." -> answer_question
  * Example: "what do these tenancy documents say about notice period?" -> answer_question
  * Example: "summarize the key points of the retrieved documents" -> answer_question


- If search_strategy is no_search, prefer answer_question.

- CRITICAL: When users ask to find a "similar case" or "locate a similar case", they want to understand the case details, not just see document titles. This is answer_question.
- CRITICAL: When users ask to find cases AND summarize/synthesize/explain them, this is answer_question, not list_documents.


Response schema:
{{
  "task_type": "list_documents|answer_question",
  "confidence": 0.0,
  "doc_id": null,
  "requires_summary": false
}}"""


async def _classify_intent_with_llm(question: str, base_parameters: dict[str, Any]) -> IntentResult | None:
    search_strategy_payload = _call_classifier_llm(
        _build_search_strategy_prompt(question, base_parameters),
        stage="Agent1",
    )
    if search_strategy_payload is None:
        return None

    merged_parameters = _merge_classifier_parameters(base_parameters, search_strategy_payload)
    search_strategy = _normalize_search_strategy(search_strategy_payload.get("search_strategy"), "", merged_parameters)
    if search_strategy != SearchStrategy.KEYWORD_SEARCH:
        merged_parameters["match_mode"] = None
        merged_parameters["exact_phrase"] = None
        merged_parameters["must_terms"] = []
        merged_parameters["should_terms"] = []
        merged_parameters["requires_exact_match"] = False
    search_confidence = float(search_strategy_payload.get("confidence", 0.8))

    search_result: dict[str, Any] | None = None
    if search_strategy != SearchStrategy.NO_SEARCH:
        search_result = await _execute_search_strategy(question, merged_parameters, search_strategy)

    task_type_payload = _call_classifier_llm(
        _build_task_type_prompt(question, search_strategy, merged_parameters, search_result),
        stage="Agent2",
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

        page_label = ""
        chunk_label = ""
        selected_pages = item.get("selected_pages")
        if isinstance(selected_pages, list) and selected_pages:
            cleaned_pages = sorted({str(page).strip() for page in selected_pages if str(page).strip()}, key=lambda v: _safe_int(v) or 0)
            if cleaned_pages:
                page_label = f"(page{','.join(cleaned_pages)})"
        elif item.get("page"):
            page_label = f"(page{item.get('page')})"
        elif item.get("page_start") and item.get("page_end"):
            start = str(item.get("page_start")).strip()
            end = str(item.get("page_end")).strip()
            if start and end:
                page_label = f"(page{start}-{end})"

        selected_chunk_indices = item.get("selected_chunk_indices")
        if isinstance(selected_chunk_indices, list) and selected_chunk_indices:
            cleaned_chunks = sorted({str(chunk).strip() for chunk in selected_chunk_indices if str(chunk).strip()}, key=lambda v: _safe_int(v) or 0)
            if cleaned_chunks:
                chunk_label = f"(chunk{','.join(cleaned_chunks)})"
        elif item.get("chunk_index") is not None:
            chunk_label = f"(chunk{item.get('chunk_index')})"

        if page_label and chunk_label:
            lines.append(f"- {title}{page_label}{chunk_label}")
        elif page_label:
            lines.append(f"- {title}{page_label}")
        elif chunk_label:
            lines.append(f"- {title}{chunk_label}")
        else:
            lines.append(f"- {title}")
    return "\n".join(lines)


def _format_document_titles_only(results: list[dict[str, Any]], limit: int = 10) -> str:
    titles = [
        item.get("source", {}).get("title", "Untitled")
        for item in (results or [])[:limit]
    ]
    if not titles:
        return "No documents found."
    return "\n".join(f"- {title}" for title in titles)


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


def _safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _collect_chunk_pages_by_document(
    chunk_results: list[dict[str, Any]],
    max_total_pages: int | None = None,
    max_pages_per_document: int | None = None,
    include_neighbor_pages: bool = False,
) -> dict[str, set[int]]:
    pages_by_document: dict[str, set[int]] = {}
    page_budget = max_total_pages if isinstance(max_total_pages, int) and max_total_pages > 0 else None
    per_document_budget = max_pages_per_document if isinstance(max_pages_per_document, int) and max_pages_per_document > 0 else None
    selected_doc_pages: set[tuple[str, int]] = set()

    for item in chunk_results or []:
        source = item.get("source", {})
        document_id = str(source.get("document_id") or "").strip()
        if not document_id:
            continue

        page_values: list[int] = []
        page = _safe_int(source.get("page"))
        if page is not None and page > 0:
            page_values.append(page)

        page_start = _safe_int(source.get("page_start"))
        page_end = _safe_int(source.get("page_end"))
        if page_start is not None and page_end is not None and page_start > 0 and page_end >= page_start:
            for value in range(page_start, page_end + 1):
                if value not in page_values:
                    page_values.append(value)

        if not page_values:
            continue

        candidate_pages: list[int] = []
        for page_value in page_values:
            if page_value > 0 and page_value not in candidate_pages:
                candidate_pages.append(page_value)
            if include_neighbor_pages:
                previous_page = page_value - 1
                next_page = page_value + 1
                if previous_page > 0 and previous_page not in candidate_pages:
                    candidate_pages.append(previous_page)
                if next_page > 0 and next_page not in candidate_pages:
                    candidate_pages.append(next_page)

        for page_value in candidate_pages:
            doc_page_key = (document_id, page_value)
            if doc_page_key in selected_doc_pages:
                continue
            current_doc_pages = pages_by_document.get(document_id, set())
            if per_document_budget is not None and len(current_doc_pages) >= per_document_budget:
                continue
            if page_budget is not None and len(selected_doc_pages) >= page_budget:
                return pages_by_document

            selected_doc_pages.add(doc_page_key)
            pages_by_document.setdefault(document_id, set()).add(page_value)

    return pages_by_document


def _collect_chunk_indices_by_document(chunk_results: list[dict[str, Any]]) -> dict[str, set[int]]:
    chunk_indices_by_document: dict[str, set[int]] = {}
    for item in chunk_results or []:
        source = item.get("source", {})
        document_id = str(source.get("document_id") or "").strip()
        if not document_id:
            continue
        chunk_index = _safe_int(source.get("chunk_index"))
        if chunk_index is None:
            continue
        chunk_indices_by_document.setdefault(document_id, set()).add(chunk_index)
    return chunk_indices_by_document


def _log_top_chunk_hits(question: str, chunk_hits: list[dict[str, Any]], top_k: int) -> None:
    logger.info(
        "Step 4: Top chunk hits | top_k=%s returned=%s question=%s",
        top_k,
        len(chunk_hits or []),
        _preview_text(question, 220),
    )
    for index, item in enumerate(chunk_hits or [], start=1):
        logger.info("Step 4: Chunk #%s | %s", index, _truncate_for_log(_summarize_chunk_result_for_log(item), 1200))


def _hydrate_documents_from_chunk_hits(chunk_results: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    ordered_doc_ids: list[str] = []
    max_score_by_doc: dict[str, float | None] = {}

    for item in chunk_results or []:
        source = item.get("source", {})
        document_id = str(source.get("document_id") or "").strip()
        if not document_id:
            continue

        score = item.get("score")
        if document_id not in max_score_by_doc:
            ordered_doc_ids.append(document_id)
            max_score_by_doc[document_id] = score
        else:
            current_score = max_score_by_doc.get(document_id)
            if isinstance(score, (int, float)) and (not isinstance(current_score, (int, float)) or score > current_score):
                max_score_by_doc[document_id] = score

    hydrated_results: list[dict[str, Any]] = []
    for document_id in ordered_doc_ids:
        if len(hydrated_results) >= limit:
            break
        try:
            doc = es.get(index=SEARCH_INDEX_NAME, id=document_id)
        except NotFoundError:
            continue
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to hydrate document %s from chunk hits: %s", document_id, exc)
            continue

        source = doc.get("_source", {})
        hydrated_results.append(
            {
                "id": document_id,
                "score": max_score_by_doc.get(document_id),
                "source": source,
                "highlight": {},
            }
        )

    return hydrated_results


def _extract_ocr_pages_from_response_payload(ocr_response: Any) -> dict[int, str]:
    if isinstance(ocr_response, str):
        raw = ocr_response.strip()
        if not raw:
            return {}
        try:
            ocr_response = json.loads(raw)
        except Exception:  # noqa: BLE001
            return {}

    if not isinstance(ocr_response, dict):
        return {}

    # Handle wrappers where the actual OCR payload is nested as a string/object.
    nested_response = ocr_response.get("response_json")
    if nested_response is not None and nested_response is not ocr_response:
        nested_pages = _extract_ocr_pages_from_response_payload(nested_response)
        if nested_pages:
            return nested_pages
    nested_ocr_response = ocr_response.get("ocr_response_json")
    if nested_ocr_response is not None and nested_ocr_response is not ocr_response:
        nested_pages = _extract_ocr_pages_from_response_payload(nested_ocr_response)
        if nested_pages:
            return nested_pages

    results = ocr_response.get("results")
    if not isinstance(results, list):
        return {}
    page_map: dict[int, str] = {}
    for item in results:
        if not isinstance(item, dict):
            continue
        page_no = _safe_int(item.get("page_no"))
        if page_no is None or page_no < 0:
            continue
        text = str(item.get("md_content") or "").strip()
        if not text:
            continue
        page_map[page_no] = text
    return page_map


def _fetch_ocr_pages_by_document_id(document_id: str) -> dict[int, str]:
    if not document_id:
        return {}

    cached = _ocr_pages_cache.get(document_id)
    if cached is not None:
        return cached

    def _extract_from_source(source: dict[str, Any]) -> dict[int, str]:
        if not isinstance(source, dict):
            return {}
        for key in ("response_json", "ocr_response_json"):
            payload = source.get(key)
            pages = _extract_ocr_pages_from_response_payload(payload)
            if pages:
                return pages
        return _extract_ocr_pages_from_response_payload(source)

    # Try direct document ID lookup first.
    try:
        doc = es.get(index=OCR_DOCUMENT_INDEX_NAME, id=document_id)
        pages = _extract_from_source(doc.get("_source", {}))
        if pages:
            _ocr_pages_cache[document_id] = pages
            return pages
    except NotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001
        _log_verbose("OCR index direct lookup failed", {"document_id": document_id, "error": str(exc)})

    # Fallback to term query on document_id.
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
            res = es.search(index=OCR_DOCUMENT_INDEX_NAME, body=body)
            hits = (res.get("hits", {}) or {}).get("hits", []) or []
            if not hits:
                continue
            source = (hits[0] or {}).get("_source", {})
            pages = _extract_from_source(source)
            if pages:
                _ocr_pages_cache[document_id] = pages
                return pages
        except Exception as exc:  # noqa: BLE001
            _log_verbose("OCR index term lookup failed", {"document_id": document_id, "field": field, "error": str(exc)})

    _ocr_pages_cache[document_id] = {}
    return {}


def _extract_ocr_pages(source: dict[str, Any], document_id: str) -> dict[int, str]:
    # User-required source of truth: dms-ocr-document index by document_id.
    page_map = _fetch_ocr_pages_by_document_id(document_id)
    if page_map:
        return page_map
    # Local payload fallback (for backward compatibility).
    page_map = _extract_ocr_pages_from_response_payload(source.get("ocr_response_json"))
    if page_map:
        return page_map
    page_map = _extract_ocr_pages_from_response_payload(source.get("response_json"))
    if page_map:
        return page_map
    return {}


def _extract_pages_from_plain_content(content: str) -> dict[int, str]:
    text = str(content or "")
    if not text:
        return {}

    marker_matches = list(re.finditer(r"\[\s*Page\s+(\d+)\s*\]", text, flags=re.IGNORECASE))
    if not marker_matches:
        return {}

    page_map: dict[int, str] = {}
    for index, match in enumerate(marker_matches):
        page_no = _safe_int(match.group(1))
        if page_no is None or page_no <= 0:
            continue
        start = match.end()
        end = marker_matches[index + 1].start() if index + 1 < len(marker_matches) else len(text)
        page_text = text[start:end].strip()
        if page_text:
            page_map[page_no] = page_text
    return page_map


def _build_page_aware_rag_context(
    results: list[dict[str, Any]],
    chunk_pages_by_document: dict[str, set[int]],
    chunk_indices_by_document: dict[str, set[int]],
    max_chars_fallback: int = 1200,
) -> str:
    sections: list[str] = []
    for index, item in enumerate(results, start=1):
        source = item.get("source", {})
        title = source.get("title", "Untitled")
        doc_id = str(item.get("id") or "").strip()
        folder_name = source.get("folder_name", "")
        folder_path = source.get("folder_path", "")
        selected_pages = sorted(list(chunk_pages_by_document.get(doc_id, set())))
        selected_chunks = sorted(list(chunk_indices_by_document.get(doc_id, set())))

        page_map = _extract_ocr_pages(source, doc_id)
        if not page_map:
            # Fallback: some records only store a combined text blob with [Page X] markers.
            combined_text = source.get("ocr_content", "") or source.get("content", "") or ""
            page_map = _extract_pages_from_plain_content(combined_text)
        selected_pages_for_content = [page for page in selected_pages if page in page_map]

        # Chunk page_start/page_end are one-based, while OCR response_json.page_no may be zero-based.
        # Prefer shifted mapping when zero-based OCR pages are detected (page 0 exists).
        if selected_pages and page_map:
            shifted_page_map = {page_no + 1: page_text for page_no, page_text in page_map.items()}
            shifted_selected_pages = [page for page in selected_pages if page in shifted_page_map]

            if 0 in page_map and shifted_selected_pages:
                page_map = shifted_page_map
                selected_pages_for_content = shifted_selected_pages
            elif not selected_pages_for_content and shifted_selected_pages:
                # Fallback for datasets where page numbering bases differ but page 0 is not present.
                page_map = shifted_page_map
                selected_pages_for_content = shifted_selected_pages

        if selected_pages_for_content:
            page_blocks: list[str] = []
            for page_no in selected_pages_for_content:
                page_text = page_map.get(page_no, "")
                page_blocks.append(
                    f"------[Page {page_no}]\n{page_text}\n------[END Page {page_no}]"
                )
            content = "\n\n".join(page_blocks)
        else:
            if selected_pages:
                # Do not fall back to full document text here to avoid leaking wrong pages (e.g., only Page 1).
                content = f"No page-level content found for selected pages {selected_pages}."
            else:
                content = source.get("ocr_content", "") or source.get("content", "") or source.get("description", "") or source.get("metadata_text", "")
                content = (content or "")[:max_chars_fallback]

        sections.append(
            "\n".join(
                [
                    f"Document {index}",
                    f"Title: {title}",
                    f"Folder Name: {folder_name}",
                    f"Folder Path: {folder_path}",
                    f"Selected Chunks: {selected_chunks}",
                    f"Selected Pages: {selected_pages}",
                    f"Content: {content}",
                ]
            )
        )
    return "\n\n---\n\n".join(sections)


def _build_document_sources_with_pages(
    results: list[dict[str, Any]],
    chunk_pages_by_document: dict[str, set[int]],
    chunk_indices_by_document: dict[str, set[int]] | None = None,
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    chunk_indices_map = chunk_indices_by_document or {}
    for item in results:
        source = item.get("source", {})
        doc_id = str(item.get("id") or "").strip()
        sources.append(
            {
                "id": doc_id,
                "score": item.get("score"),
                "title": source.get("title", "Untitled"),
                "folder_name": source.get("folder_name", ""),
                "folder_path": source.get("folder_path", ""),
                "created_at": source.get("created_at", ""),
                "selected_pages": sorted(list(chunk_pages_by_document.get(doc_id, set()))),
                "selected_chunk_indices": sorted(list(chunk_indices_map.get(doc_id, set()))),
            }
        )
    return sources


def _summarize_chunk_result_for_log(result: dict[str, Any]) -> dict[str, Any]:
    source = result.get("source", {})
    return {
        "id": result.get("id"),
        "document_id": source.get("document_id", ""),
        "chunk_index": source.get("chunk_index"),
        "page": source.get("page"),
        "page_start": source.get("page_start"),
        "page_end": source.get("page_end"),
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
                "page": source.get("page"),
                "page_start": source.get("page_start"),
                "page_end": source.get("page_end"),
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
        page = source.get("page", "")
        page_start = source.get("page_start", "")
        page_end = source.get("page_end", "")
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
                    f"Page: {page}",
                    f"Page Start: {page_start}",
                    f"Page End: {page_end}",
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
        search_kwargs = _build_search_request_kwargs(SEARCH_PREFERENCE)
        res = es.search(index=SEARCH_INDEX_NAME, body=body, **search_kwargs)
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
        search_kwargs = _build_search_request_kwargs(SEARCH_PREFERENCE)
        res = es.search(index=SEARCH_INDEX_NAME, body=body, **search_kwargs)
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


def _execute_chunk_search(
    query_text: str,
    parameters: dict[str, Any] | None = None,
    top_k: int = 5,
    search_strategy: SearchStrategy = SearchStrategy.HYBRID_SEARCH,
) -> dict:
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

    text_fields = ["title^2", "ocr_content", CHUNK_TEXT_FIELD, "metadata_text", "folder_name", "folder_path"]
    body: dict[str, Any] = {
        "from": 0,
        "size": max(100, top_k),
        "highlight": {
            "fields": {
                CHUNK_TEXT_FIELD: {"type": "unified", "number_of_fragments": 3, "fragment_size": 260},
                "title": {},
                "metadata_text": {},
                "folder_path": {},
            }
        },
    }

    keyword_mode = (
        search_strategy == SearchStrategy.KEYWORD_SEARCH
        or params.get("match_mode") in KEYWORD_MATCH_MODES
        or bool(params.get("exact_phrase") or params.get("must_terms") or params.get("should_terms"))
    )

    if keyword_mode:
        must_clauses: list[dict[str, Any]] = []
        should_clauses: list[dict[str, Any]] = []
        match_mode = params.get("match_mode")

        if not match_mode:
            if params.get("must_terms"):
                match_mode = "all_terms"
            elif params.get("should_terms"):
                match_mode = "any_terms"

        exact_phrase = str(params.get("exact_phrase") or "").strip()
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
                            "query": str(term),
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
                            "query": str(term),
                            "fields": text_fields,
                            "operator": "and",
                        }
                    }
                )

        if not must_clauses and not should_clauses:
            must_clauses.append({"multi_match": {"query": query, "fields": text_fields}})

        bool_query: dict[str, Any] = {"must": must_clauses}
        if should_clauses:
            bool_query["should"] = should_clauses
            bool_query["minimum_should_match"] = 1
            if not must_clauses:
                bool_query.pop("must", None)
        if filter_clauses:
            bool_query["filter"] = filter_clauses
        body["query"] = {"bool": bool_query}
    else:
        embedder = _get_embedding_model()
        if embedder is False:
            text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields}}
            if filter_clauses:
                text_query = {"bool": {"must": [text_query], "filter": filter_clauses}}
            body["query"] = text_query
        else:
            query_embedding = embedder.encode(f"query: {query}", normalize_embeddings=True).tolist()
            knn_k = max(60, top_k * 6)

            text_query: dict[str, Any] = {"multi_match": {"query": query, "fields": text_fields}}
            if filter_clauses:
                text_query = {
                    "bool": {
                        "must": [{"multi_match": {"query": query, "fields": text_fields}}],
                        "filter": filter_clauses,
                    }
                }

            title_knn_query: dict[str, Any] = {
                "knn": {
                    CHUNK_TITLE_VECTOR_FIELD: {
                        "vector": query_embedding,
                        "k": knn_k,
                    }
                }
            }
            content_knn_query: dict[str, Any] = {
                "knn": {
                    CHUNK_CONTENT_VECTOR_FIELD: {
                        "vector": query_embedding,
                        "k": knn_k,
                    }
                }
            }
            chunk_knn_query: dict[str, Any] = {
                "knn": {
                    CHUNK_VECTOR_FIELD: {
                        "vector": query_embedding,
                        "k": knn_k,
                    }
                }
            }
            if filter_clauses:
                title_knn_query["knn"][CHUNK_TITLE_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}
                content_knn_query["knn"][CHUNK_CONTENT_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}
                chunk_knn_query["knn"][CHUNK_VECTOR_FIELD]["filter"] = {"bool": {"filter": filter_clauses}}

            body["query"] = {
                "hybrid": {
                    "queries": [
                        text_query,
                        title_knn_query,
                        content_knn_query,
                        chunk_knn_query,
                    ]
                }
            }
            body["search_pipeline"] = CHUNK_SEARCH_PIPELINE_NAME

    try:
        _log_search_body("OpenSearch _execute_chunk_search body", CHUNK_SEARCH_INDEX_NAME, body)
        search_kwargs = _build_search_request_kwargs(CHUNK_SEARCH_PREFERENCE)
        _log_verbose(
            "_execute_chunk_search request",
            {
                "index": CHUNK_SEARCH_INDEX_NAME,
                "query": query,
                "top_k": top_k,
                "search_strategy": search_strategy.value,
                "keyword_mode": keyword_mode,
                "preference": CHUNK_SEARCH_PREFERENCE,
                "body": body,
            },
        )
        res = es.search(index=CHUNK_SEARCH_INDEX_NAME, body=body, **search_kwargs)
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

async def orchestrate_agent_chat(
    question: str,
    chat_id: Optional[str] = None,
    include_neighbor_pages: bool = False,
) -> dict:
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
            answer = _format_document_titles_only(agent_result.get("results", []), limit=10)
            response_payload = {"answer": answer, "search_results": agent_result}

        elif intent == IntentType.SEMANTIC_SEARCH:
            agent_result = prefetched_search_result or await SemanticSearchAgent.execute(question, parameters=params)
            answer = _format_document_titles_only(agent_result.get("results", []), limit=10)
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
                include_neighbor_pages=include_neighbor_pages,
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
    categories = _normalize_string_list(req.category or req.categories)
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
    usage_obj = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    prompt_tokens = usage_obj.get("prompt_tokens", payload.get("prompt_eval_count"))
    completion_tokens = usage_obj.get("completion_tokens", payload.get("eval_count"))
    total_tokens = None
    if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
        total_tokens = prompt_tokens + completion_tokens
    if isinstance(usage_obj.get("total_tokens"), int):
        total_tokens = usage_obj.get("total_tokens")
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
    provider = _resolved_llm_provider()
    if provider in {"vllm", "openai"}:
        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": stream,
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "max_tokens": LLM_MAX_TOKENS,
        }
        _log_verbose("Built LLM payload", _summarize_llm_payload_for_log(payload))
        return payload

    payload = {
        "model": LLM_MODEL,
        "stream": stream,
        "think": False,
        "parameters": {
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "max_tokens": LLM_MAX_TOKENS,
        },
        "messages": messages,
    }
    _log_verbose("Built LLM payload", _summarize_llm_payload_for_log(payload))
    return payload


def _log_agent3_prompt(messages: list[dict[str, str]], stream: bool) -> None:
    logger.info(
        "Step 5: Agent3 prompt sent to LLM | stream=%s\n%s",
        stream,
        json.dumps(messages, ensure_ascii=False, indent=2),
    )


def _log_agent3_response(response_text: str, stream: bool) -> None:
    logger.info(
        "Step 5: Agent3 response from LLM | stream=%s\n%s",
        stream,
        response_text,
    )

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
    _log_agent3_prompt(messages, stream=False)
    _log_workflow_step(
        5,
        "Send non-stream LLM request",
        {"chat_id": resolved_chat_id, "llm_api": LLM_API, "payload": _summarize_llm_payload_for_log(payload)},
        verbose_only=True,
    )
    response = requests.post(LLM_API, json=payload, headers=_build_llm_headers(), timeout=90)
    if not response.ok:
        provider = _resolved_llm_provider()
        error_preview = _preview_text(response.text, 500)
        if response.status_code == 400 and provider in {"vllm", "openai"}:
            retry_payload = _build_reduced_payload_for_retry(payload, provider)
            logger.warning(
                "Step 5: Non-stream LLM returned 400, retrying with reduced payload | chat_id=%s error=%s",
                resolved_chat_id,
                error_preview,
            )
            retry_response = requests.post(LLM_API, json=retry_payload, headers=_build_llm_headers(), timeout=90)
            if retry_response.ok:
                response = retry_response
            else:
                retry_error_preview = _preview_text(retry_response.text, 500)
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM API error: {retry_response.status_code} | {retry_error_preview}",
                )
        else:
            raise HTTPException(status_code=502, detail=f"LLM API error: {response.status_code} | {error_preview}")
    body = response.json()
    _log_workflow_step(
        5,
        "Received non-stream LLM response",
        {"chat_id": resolved_chat_id, "response": _summarize_provider_response_for_log(body)},
        verbose_only=True,
    )
    assistant_response = remove_deepthink(_extract_assistant_content(body))
    _log_agent3_response(assistant_response, stream=False)
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
    print(f"Total tokens in context: {total_tokens}")
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
    provider = _resolved_llm_provider()
    _log_agent3_prompt(messages, stream=True)
    def _event_generator():
        assistant_response = ""
        final_event: dict[str, Any] = {}
        chunk_count = 0
        fallback_message = "I could not generate a complete answer from the model output. Please rephrase the question or try again."
        try:
            _log_workflow_step(
                5,
                "Send stream LLM request",
                {"chat_id": resolved_chat_id, "llm_api": LLM_API, "payload": _summarize_llm_payload_for_log(payload)},
                verbose_only=True,
            )
            response = requests.post(LLM_API, json=payload, headers=_build_llm_headers(), stream=True, timeout=90)
            if response.status_code != 200:
                error_preview = _preview_text(response.text, 500)
                if response.status_code == 400 and provider in {"vllm", "openai"}:
                    retry_payload = _build_reduced_payload_for_retry(payload, provider)
                    logger.warning(
                        "Step 5: Stream LLM returned 400, retrying with reduced payload | chat_id=%s error=%s",
                        resolved_chat_id,
                        error_preview,
                    )
                    response = requests.post(LLM_API, json=retry_payload, headers=_build_llm_headers(), stream=True, timeout=90)
                    if response.status_code != 200:
                        retry_error_preview = _preview_text(response.text, 500)
                        yield f"data: {json.dumps({'error': f'LLM API error: {response.status_code} | {retry_error_preview}', 'complete': True})}\n\n"
                        return
                else:
                    yield f"data: {json.dumps({'error': f'LLM API error: {response.status_code} | {error_preview}', 'complete': True})}\n\n"
                    return
            for line in response.iter_lines():
                if not line:
                    continue
                decoded = line.decode("utf-8")
                if provider in {"vllm", "openai"}:
                    if not decoded.startswith("data: "):
                        continue
                    data_str = decoded[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                else:
                    try:
                        data = json.loads(decoded)
                    except json.JSONDecodeError:
                        continue

                chunk, done = _extract_stream_chunk_and_done(data, provider)
                if done:
                    final_event = data
                    _log_workflow_step(
                        5,
                        "Received final stream event",
                        {"chat_id": resolved_chat_id, "event": _summarize_provider_response_for_log(final_event)},
                        verbose_only=True,
                    )
                if not chunk:
                    continue
                chunk_count += 1
                assistant_response += chunk
                yield f"data: {json.dumps({'chunk': chunk, 'chat_id': resolved_chat_id, 'complete': False})}\n\n"
            cleaned = assistant_response.strip()
            logger.info(
                "Step 5: Stream completion stats | chat_id=%s chunk_count=%s response_chars=%s",
                resolved_chat_id,
                chunk_count,
                len(cleaned),
            )
            if not cleaned:
                logger.warning(
                    "Step 5: Empty streamed assistant response; attempting non-stream fallback | chat_id=%s",
                    resolved_chat_id,
                )
                fallback_payload = _build_llm_payload(messages, stream=False)
                fallback_response = requests.post(
                    LLM_API,
                    json=fallback_payload,
                    headers=_build_llm_headers(),
                    timeout=90,
                )
                if fallback_response.ok:
                    fallback_body = fallback_response.json()
                    fallback_text = remove_deepthink(_extract_assistant_content(fallback_body)).strip()
                    if fallback_text:
                        cleaned = fallback_text
                        final_event = fallback_body
                        logger.info(
                            "Step 5: Non-stream fallback recovered response | chat_id=%s response_chars=%s",
                            resolved_chat_id,
                            len(cleaned),
                        )
                    else:
                        logger.warning("Step 5: Non-stream fallback returned empty content | chat_id=%s", resolved_chat_id)
                else:
                    logger.warning(
                        "Step 5: Non-stream fallback failed with HTTP %s | chat_id=%s",
                        fallback_response.status_code,
                        resolved_chat_id,
                    )

                if not cleaned:
                    cleaned = fallback_message

                yield f"data: {json.dumps({'chunk': cleaned, 'chat_id': resolved_chat_id, 'complete': False})}\n\n"
            _log_agent3_response(cleaned, stream=True)
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
        body["search_pipeline"] = SEARCH_PIPELINE_NAME
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
        "search_pipeline": SEARCH_PIPELINE_NAME,
        "chunk_search_pipeline": CHUNK_SEARCH_PIPELINE_NAME,
        "search_preference": SEARCH_PREFERENCE,
        "chunk_search_preference": CHUNK_SEARCH_PREFERENCE,
        "chat_log_index": CHAT_LOG_INDEX,
        "title_vector_field": TITLE_VECTOR_FIELD,
        "content_vector_field": CONTENT_VECTOR_FIELD,
        "chunk_vector_field": CHUNK_VECTOR_FIELD,
        "chunk_title_vector_field": CHUNK_TITLE_VECTOR_FIELD,
        "chunk_content_vector_field": CHUNK_CONTENT_VECTOR_FIELD,
        "chunk_text_field": CHUNK_TEXT_FIELD,
        "llm_model": LLM_MODEL,
    }

@app.post("/api/chatbot/search")
def search(req: SearchRequest) -> dict[str, Any]:
    try:
        body, date_filter = _build_search_body(req)
        _log_search_body("OpenSearch /api/chatbot/search body", SEARCH_INDEX_NAME, body)
        try:
            search_kwargs = _build_search_request_kwargs(SEARCH_PREFERENCE)
            res = es.search(index=SEARCH_INDEX_NAME, body=body, **search_kwargs)
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
                search_kwargs = _build_search_request_kwargs(SEARCH_PREFERENCE)
                res = es.search(index=SEARCH_INDEX_NAME, body=body, **search_kwargs)
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
async def agent_chat(req: ChatRequest, request: Request):
    """
    Multi‑agent endpoint: classifies intent and routes to specialist agents.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Missing question")
    _log_workflow_step(
        1,
        "Receive /api/chatbot/agent-chat request",
        {
            "chat_id": req.chat_id,
            "stream": req.stream,
            "question": req.question,
            "press_releases_count": len(req.press_releases),
            "include_neighbor_pages": req.include_neighbor_pages,
            "statistics_generation": req.statistics_generation,
        },
    )
    # If press releases are provided, fallback to original chat
    if req.press_releases:
        return chat(req)

    if req.statistics_generation:
        incoming_headers = {
            "Authorization": request.headers.get("authorization", ""),
            "Cookie": request.headers.get("cookie", ""),
            "X-Auth-Token": request.headers.get("x-auth-token", ""),
            "X-CSRF-Token": request.headers.get("x-csrf-token", ""),
        }
        statistics_result = _run_statistics_generation(
            req.question,
            req.chat_id,
            forwarded_headers=incoming_headers,
        )
        if req.stream:
            generator = _stream_text_response(
                statistics_result["answer"],
                statistics_result["chat_id"],
                IntentType.STATS_COUNT,
                {"classification": statistics_result.get("classification", {})},
            )
            return StreamingResponse(generator, media_type="text/event-stream")
        return statistics_result

    if req.stream:
        intent_result = await IntentClassifier.classify(req.question)
        generator = await _build_agent_stream(
            req.question,
            req.chat_id,
            intent_result,
            include_neighbor_pages=req.include_neighbor_pages,
        )
        return StreamingResponse(generator, media_type="text/event-stream")

    result = await orchestrate_agent_chat(
        req.question,
        req.chat_id,
        include_neighbor_pages=req.include_neighbor_pages,
    )
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
        "You are a helpful assistant for document comparison and summarization. "
        "Determine the dominant language from the provided document context and reply in that language. "
        "If the context language is mixed or unclear, default to English. "
        f"Please list document titles, compare, and summarize these {len(req.press_releases)} documents."
        f"\n\nDocument context:\n{combined}"
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

