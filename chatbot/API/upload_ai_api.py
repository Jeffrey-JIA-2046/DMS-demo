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
from pathlib import Path
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

_API_DIR = Path(__file__).resolve().parent
_ENV_CANDIDATES = [
    _API_DIR.parent / ".env",
    _API_DIR.parent.parent / "chatbot" / ".env",
]
for _env_path in _ENV_CANDIDATES:
    if _env_path.exists():
        load_dotenv(_env_path, override=False)
        break
else:
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
DOTSOCR_BASE_URL = os.getenv("UPLOAD_AI_OCR_BASE_URL") or os.getenv("DOTSOCR_BASE_URL") or "http://192.168.1.111:9000"
DOTSOCR_PDF_PATH = os.getenv("UPLOAD_AI_OCR_PDF_PATH") or os.getenv("DOTSOCR_PDF_PATH") or "/ocr/pdf"
OCR_PROVIDER_MODE = (os.getenv("UPLOAD_AI_OCR_PROVIDER") or "auto").strip().lower()
LLM_API = (
    os.getenv("UPLOAD_AI_LLM_API")
    or os.getenv("LLM_API")
    or os.getenv("UPLOAD_AI_OLLAMA_URL")
    or "http://localhost:11434/api/chat"
).strip()
LLM_PROVIDER = (os.getenv("UPLOAD_AI_LLM_PROVIDER") or os.getenv("LLM_PROVIDER") or "auto").strip().lower()
LLM_MODEL = (os.getenv("UPLOAD_AI_LLM_MODEL") or os.getenv("LLM_MODEL") or "deepseek-r1:14b").strip()
LLM_API_KEY = (os.getenv("UPLOAD_AI_LLM_API_KEY") or os.getenv("LLM_API_KEY") or "").strip()
LLM_MAX_TOKENS = int(os.getenv("UPLOAD_AI_LLM_MAX_TOKENS") or os.getenv("LLM_MAX_TOKENS") or "1024")
LLM_TEMPERATURE = float(os.getenv("UPLOAD_AI_LLM_TEMPERATURE") or os.getenv("LLM_TEMPERATURE") or "0.1")
LLM_TOP_P = float(os.getenv("UPLOAD_AI_LLM_TOP_P") or os.getenv("LLM_TOP_P") or "0.7")
LLM_ENABLE_THINKING = (os.getenv("UPLOAD_AI_LLM_ENABLE_THINKING") or os.getenv("LLM_ENABLE_THINKING") or "false").strip().lower() == "true"

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
    "Upload AI API config | log_level=%s | llm_provider=%s | llm_api=%s | ocr_provider=%s | ocr_api=%s | folder_map_info=%s | llm_raw_info=%s",
    LOG_LEVEL,
    LLM_PROVIDER,
    LLM_API,
    OCR_PROVIDER_MODE,
    f"{DOTSOCR_BASE_URL.rstrip('/')}{DOTSOCR_PDF_PATH}",
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


def _auth_headers(authorization: Optional[str], client_session_id: Optional[str] = None) -> dict[str, str]:
    headers: dict[str, str] = {}
    if authorization and authorization.strip():
        headers["Authorization"] = authorization.strip()
    if client_session_id and client_session_id.strip():
        headers["X-Client-Session-Id"] = client_session_id.strip()
    return headers


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


def _resolved_provider() -> str:
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


def _build_llm_payload(system: str, user: str) -> dict[str, Any]:
    provider = _resolved_provider()
    if provider in {"vllm", "openai"}:
        payload: dict[str, Any] = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": LLM_MAX_TOKENS,
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "stream": False,
        }
        if not LLM_ENABLE_THINKING:
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        return payload

    return {
        "model": LLM_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "options": {
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "num_predict": LLM_MAX_TOKENS,
        },
    }


def _extract_llm_content(payload: dict[str, Any]) -> str:
    message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
    if isinstance(message.get("content"), str) and message.get("content"):
        return str(message.get("content"))

    choices = payload.get("choices") if isinstance(payload.get("choices"), list) else []
    if choices and isinstance(choices[0], dict):
        message_obj = choices[0].get("message") if isinstance(choices[0].get("message"), dict) else {}
        content = message_obj.get("content")
        if isinstance(content, str):
            return content

    for key in ("content", "response", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value

    return ""


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

    payload = _build_llm_payload(
        system="You are a strict document type classifier.",
        user=prompt,
    )

    try:
        logger.debug(
            "Calling LLM for doc-type detection | provider=%s | api=%s | model=%s | text_chars=%s",
            _resolved_provider(),
            LLM_API,
            LLM_MODEL,
            len(first_pages_text),
        )
        response = requests.post(
            LLM_API,
            json=payload,
            headers=_build_llm_headers(),
            timeout=120,
        )
    except requests.exceptions.ConnectionError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach document classifier LLM at {LLM_API}: {exc}") from exc
    except requests.exceptions.Timeout as exc:
        raise HTTPException(status_code=504, detail="Doc type classification request timed out") from exc

    if not response.ok:
        raise HTTPException(status_code=502, detail=f"LLM error {response.status_code}: {response.text[:400]}")

    try:
        content = _extract_llm_content(response.json())
        if not content:
            raise ValueError("empty response content")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM response format: {exc}") from exc

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


def _find_folder_id_by_id(nodes: list[FolderNode], target_id: str) -> Optional[str]:
    target = target_id.strip()
    if not target:
        return None

    for node in nodes:
        if node.folder_id == target:
            return node.folder_id
        nested = _find_folder_id_by_id(node.children, target_id)
        if nested:
            return nested
    return None


def _collect_folder_names(nodes: list[FolderNode]) -> list[str]:
    names: list[str] = []
    for node in nodes:
        names.append(node.name)
        names.extend(_collect_folder_names(node.children))
    return names


def _fetch_folder_tree(authorization: Optional[str], client_session_id: Optional[str] = None) -> list[FolderNode]:
    logger.debug("Loading folder tree from DMS")
    response = requests.get(
        f"{DMS_BASE_URL}/api/folders/tree",
        headers=_auth_headers(authorization, client_session_id),
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


def _resolve_folder_id_for_doc_type(
    doc_type: str,
    authorization: Optional[str],
    client_session_id: Optional[str] = None,
    fallback_folder_id: Optional[str] = None,
) -> str:
    mapping = _resolve_mapping_entry(doc_type)
    logger.debug("Resolving folder mapping | doc_type=%s | mapping_type=%s", doc_type, type(mapping).__name__)
    folder_tree: Optional[list[FolderNode]] = None

    def load_tree() -> list[FolderNode]:
        nonlocal folder_tree
        if folder_tree is None:
            folder_tree = _fetch_folder_tree(authorization, client_session_id)
        return folder_tree

    if isinstance(mapping, dict):
        folder_id = str(mapping.get("folderId") or mapping.get("folder_id") or "").strip()
        if folder_id:
            tree = load_tree()
            if _find_folder_id_by_id(tree, folder_id):
                return folder_id
            logger.warning("Configured folderId does not exist in DMS folder tree | doc_type=%s | folder_id=%s", doc_type, folder_id)

        folder_name = str(mapping.get("folderName") or mapping.get("folder_name") or "").strip()
        if folder_name:
            tree = load_tree()
            found = _find_folder_id_by_name(tree, folder_name)
            if found:
                logger.debug("Resolved folder by name | doc_type=%s | folder_name=%s | folder_id=%s", doc_type, folder_name, found)
                return found
            logger.warning("Configured folderName was not found in DMS folder tree | doc_type=%s | folder_name=%s", doc_type, folder_name)

    elif isinstance(mapping, str) and mapping.strip():
        value = mapping.strip()
        tree = load_tree()
        found_by_name = _find_folder_id_by_name(tree, value)
        if found_by_name:
            logger.debug("Resolved folder by string-name mapping | doc_type=%s | value=%s | folder_id=%s", doc_type, value, found_by_name)
            return found_by_name

        found_by_id = _find_folder_id_by_id(tree, value)
        if found_by_id:
            logger.debug("Resolved folder by string-id mapping | doc_type=%s | value=%s", doc_type, value)
            return found_by_id

        logger.warning("String mapping did not match any DMS folder name or id | doc_type=%s | value=%s", doc_type, value)

    normalized_fallback_folder_id = str(fallback_folder_id or "").strip()
    if normalized_fallback_folder_id:
        tree = load_tree()
        if _find_folder_id_by_id(tree, normalized_fallback_folder_id):
            logger.warning(
                "Using caller-provided folderId as AI filing fallback | doc_type=%s | folder_id=%s",
                doc_type,
                normalized_fallback_folder_id,
            )
            return normalized_fallback_folder_id
        logger.warning(
            "Caller-provided fallback folderId does not exist in DMS folder tree | doc_type=%s | folder_id=%s",
            doc_type,
            normalized_fallback_folder_id,
        )

    if DEFAULT_FOLDER_ID:
        tree = load_tree()
        if _find_folder_id_by_id(tree, DEFAULT_FOLDER_ID):
            return DEFAULT_FOLDER_ID
        logger.warning("Configured default folderId does not exist in DMS folder tree | folder_id=%s", DEFAULT_FOLDER_ID)

    tree = load_tree()
    folder_names = _collect_folder_names(tree)
    preview_names = ", ".join(folder_names[:10]) if folder_names else "none"

    raise HTTPException(
        status_code=400,
        detail=(
            f"No valid folder mapping found for doc_type={doc_type}. "
            f"Current mapping={mapping!r}. "
            "Configure UPLOAD_AI_DOC_TYPE_FOLDER_MAP with real DMS folder names or IDs, "
            f"or set UPLOAD_AI_DEFAULT_FOLDER_ID. Available folders include: {preview_names}."
        ),
    )


def _run_temp_ocr(
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    authorization: Optional[str],
    client_session_id: Optional[str],
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

    def parse_payload(response: requests.Response, source: str) -> dict[str, Any]:
        if not response.ok:
            raise HTTPException(status_code=502, detail=f"{source} OCR failed: {response.status_code} {response.text[:400]}")
        try:
            payload = response.json()
            result_count = len(payload.get("results", [])) if isinstance(payload, dict) else 0
            logger.info("Pre-upload OCR completed | request_id=%s | file=%s | pages=%s | source=%s", request_id, file_name, result_count, source)
            return payload
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"{source} OCR response is not valid JSON: {exc}") from exc

    dms_error: Optional[HTTPException] = None

    if OCR_PROVIDER_MODE in {"auto", "dms", "dms_proxy"}:
        try:
            response = requests.post(
                f"{DMS_BASE_URL}/api/documents/ocr/pdf",
                files=files,
                data=data,
                headers=_auth_headers(authorization, client_session_id),
                timeout=300,
            )
            return parse_payload(response, "DMS proxy")
        except HTTPException as exc:
            dms_error = exc
            logger.warning("DMS proxy OCR failed | request_id=%s | detail=%s", request_id, exc.detail)
            if OCR_PROVIDER_MODE in {"dms", "dms_proxy"}:
                raise
        except requests.exceptions.ConnectionError as exc:
            dms_error = HTTPException(status_code=502, detail=f"Cannot reach DMS OCR proxy at {DMS_BASE_URL}/api/documents/ocr/pdf: {exc}")
            logger.warning("DMS proxy OCR unreachable | request_id=%s | error=%s", request_id, exc)
            if OCR_PROVIDER_MODE in {"dms", "dms_proxy"}:
                raise dms_error from exc
        except requests.exceptions.Timeout as exc:
            dms_error = HTTPException(status_code=504, detail="DMS OCR proxy request timed out")
            logger.warning("DMS proxy OCR timed out | request_id=%s", request_id)
            if OCR_PROVIDER_MODE in {"dms", "dms_proxy"}:
                raise dms_error from exc

    if OCR_PROVIDER_MODE in {"auto", "direct", "dots", "dots_ocr"}:
        dots_url = f"{DOTSOCR_BASE_URL.rstrip('/')}{DOTSOCR_PDF_PATH}"
        try:
            response = requests.post(
                dots_url,
                files=files,
                data=data,
                timeout=300,
            )
            return parse_payload(response, "Dots OCR direct")
        except HTTPException as exc:
            logger.warning("Dots OCR direct failed | request_id=%s | detail=%s", request_id, exc.detail)
            if dms_error is not None and OCR_PROVIDER_MODE == "auto":
                raise HTTPException(
                    status_code=502,
                    detail=f"DMS OCR proxy failed first: {dms_error.detail} | Direct OCR failed next: {exc.detail}",
                ) from exc
            raise
        except requests.exceptions.ConnectionError as exc:
            detail = f"Cannot reach Dots OCR direct API at {dots_url}: {exc}"
            logger.warning("Dots OCR direct unreachable | request_id=%s | error=%s", request_id, exc)
            if dms_error is not None and OCR_PROVIDER_MODE == "auto":
                raise HTTPException(
                    status_code=502,
                    detail=f"DMS OCR proxy failed first: {dms_error.detail} | Direct OCR failed next: {detail}",
                ) from exc
            raise HTTPException(status_code=502, detail=detail) from exc
        except requests.exceptions.Timeout as exc:
            detail = "Dots OCR direct request timed out"
            logger.warning("Dots OCR direct timed out | request_id=%s", request_id)
            if dms_error is not None and OCR_PROVIDER_MODE == "auto":
                raise HTTPException(
                    status_code=504,
                    detail=f"DMS OCR proxy failed first: {dms_error.detail} | Direct OCR failed next: {detail}",
                ) from exc
            raise HTTPException(status_code=504, detail=detail) from exc

    if dms_error is not None:
        raise dms_error

    raise HTTPException(status_code=500, detail=f"Unsupported UPLOAD_AI_OCR_PROVIDER value: {OCR_PROVIDER_MODE}")


def _upload_to_dms(
    metadata: dict[str, Any],
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    authorization: Optional[str],
    client_session_id: Optional[str] = None,
) -> dict[str, Any]:
    logger.debug("Uploading document to DMS | file=%s | content_type=%s | folder_id=%s", file_name, content_type, metadata.get("folderId"))
    files = {
        "metadata": ("metadata.json", json.dumps(metadata, ensure_ascii=False), "application/json"),
        "file": (file_name, file_bytes, content_type or "application/octet-stream"),
    }

    response = requests.post(
        f"{DMS_BASE_URL}/api/documents",
        files=files,
        headers=_auth_headers(authorization, client_session_id),
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
        "llm_api": LLM_API,
        "llm_provider": _resolved_provider(),
        "ocr_provider": OCR_PROVIDER_MODE,
        "ocr_api": f"{DOTSOCR_BASE_URL.rstrip('/')}{DOTSOCR_PDF_PATH}",
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
    x_client_session_id: Optional[str] = Header(None),
) -> dict[str, Any]:
    request_id = str(uuid4())[:8]
    started_at = time.perf_counter()
    try:
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
            uploaded = _upload_to_dms(metadata, file_name, content_type, file_bytes, authorization, x_client_session_id)
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
            client_session_id=x_client_session_id,
            prompt=ocr_prompt,
            confidence=ocr_confidence,
            request_id=request_id,
        )

        first_pages_text = _extract_pages_text(ocr_payload, MAX_DETECT_PAGES)
        if not first_pages_text:
            raise HTTPException(status_code=422, detail="OCR succeeded but first pages text is empty")

        detection = _detect_doc_type(first_pages_text, detect_prompt)
        requested_folder_id = str(metadata.get("folderId") or "").strip() or None
        target_folder_id = _resolve_folder_id_for_doc_type(
            detection["doc_type"],
            authorization,
            x_client_session_id,
            fallback_folder_id=requested_folder_id,
        )
        logger.info(
            "AI filing classification done | request_id=%s | detected=%s | target_folder_id=%s",
            request_id,
            detection.get("doc_type"),
            target_folder_id,
        )

        metadata["folderId"] = target_folder_id

        if not metadata.get("category"):
            metadata["category"] = detection["doc_type"]

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

        uploaded = _upload_to_dms(metadata, file_name, content_type, file_bytes, authorization, x_client_session_id)
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
    except HTTPException as exc:
        logger.error(
            "Upload failed | request_id=%s | mode=%s | status=%s | detail=%s",
            request_id,
            mode,
            exc.status_code,
            exc.detail,
        )
        raise
    except Exception:
        logger.exception("Upload failed unexpectedly | request_id=%s | mode=%s", request_id, mode)
        raise


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "upload_ai_api:app",
        host="0.0.0.0",
        port=int(os.getenv("UPLOAD_AI_API_PORT", "5201")),
        reload=True,
    )
