"""
Data Extraction API
Exposes the structured-data extraction pipeline from DeepSeek-OCR as a
standalone FastAPI service so other applications (e.g. DMS) can call it
via HTTP.

Default port : 5001
LLM API      : EXTRACTION_LLM_API (default http://localhost:11434/api/chat)
LLM provider : EXTRACTION_LLM_PROVIDER (auto|ollama|vllm|openai, default auto)
LLM model    : EXTRACTION_LLM_MODEL (default deepseek-r1:14b)
Allowed CORS : EXTRACTION_CORS_ORIGINS (comma-separated, default *)

Run locally:
    uvicorn data_extraction_api:app --host 0.0.0.0 --port 5001 --reload
"""

import os
import re
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except Exception:  # noqa: BLE001
    load_dotenv = None


if load_dotenv is not None:
    _api_dir = Path(__file__).resolve().parent
    _env_candidates = [
        _api_dir.parent / ".env",
        _api_dir.parent.parent / "chatbot" / ".env",
    ]
    for _env_path in _env_candidates:
        if _env_path.exists():
            load_dotenv(_env_path, override=False)
            break

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LLM_API: str = (
    os.getenv("EXTRACTION_LLM_API")
    or os.getenv("LLM_API")
    or os.getenv("EXTRACTION_OLLAMA_URL")
    or "http://localhost:11434/api/chat"
)
LLM_PROVIDER: str = (os.getenv("EXTRACTION_LLM_PROVIDER") or os.getenv("LLM_PROVIDER") or "auto").strip().lower()
LLM_MODEL: str = os.getenv("EXTRACTION_LLM_MODEL") or os.getenv("LLM_MODEL") or "deepseek-r1:14b"
LLM_API_KEY: str = os.getenv("EXTRACTION_LLM_API_KEY", "").strip()
LLM_MAX_TOKENS: int = int(os.getenv("EXTRACTION_LLM_MAX_TOKENS", "4000"))
LLM_TEMPERATURE: float = float(os.getenv("EXTRACTION_LLM_TEMPERATURE", "0.2"))
LLM_TOP_P: float = float(os.getenv("EXTRACTION_LLM_TOP_P", "0.7"))
LLM_ENABLE_THINKING: bool = (
    os.getenv("EXTRACTION_LLM_ENABLE_THINKING")
    or os.getenv("LLM_ENABLE_THINKING")
    or "false"
).strip().lower() == "true"
_raw_origins: str = os.getenv("EXTRACTION_CORS_ORIGINS", "*")
CORS_ORIGINS: list[str] = (
    ["*"] if _raw_origins.strip() == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]
)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Data Extraction API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class MetadataField(BaseModel):
    key: str
    label: str
    type: str  # TEXT, DATE, NUMBER, EMAIL, etc.
    required: bool = False
    hint: Optional[str] = None


class ExtractionRequest(BaseModel):
    ocr_text: str
    form_type: str = "form1"
    metadata_template: list[MetadataField]  # Dynamic template from folder


class ExtractionResponse(BaseModel):
    status_code: int
    form_type: str
    extracted_json: dict  # Keys match metadata_template[].key

# ---------------------------------------------------------------------------
# Extraction logic (Template-driven)
# ---------------------------------------------------------------------------

def _build_prompt_from_template(content: str, template: list[MetadataField]) -> str:
    """
    Build a dynamic extraction prompt based on the metadata template.
    """
    if not template:
        raise ValueError("metadata_template cannot be empty")

    # Build field descriptions
    field_lines = []
    for i, field in enumerate(template, 1):
        field_type = field.type
        required_marker = "[REQUIRED]" if field.required else "[OPTIONAL]"
        hint_text = f" Hint: {field.hint}" if field.hint else ""
        field_lines.append(
            f"{i}) {field.label} (key: {field.key}, type: {field_type}) {required_marker}{hint_text}"
        )

    fields_section = "\n".join(field_lines)

    return f"""
Extract the following fields from the document content.
Return a structured response with exact matching to the field definitions.
If a field value is not found, use "N/A".

FIELD DEFINITIONS:
{fields_section}

EXTRACTION RULES:
- Extract text exactly as it appears in the document
- Match each field to its extraction key (the "key:" value above)
- For DATE fields, use ISO format (YYYY-MM-DD) if possible, otherwise "N/A"
- For EMAIL/TEXT fields, preserve the original formatting
- For REQUIRED fields, try harder to find the value

FORMAT YOUR RESPONSE EXACTLY AS:
[EXTRACTION START]
key1: value1
key2: value2
...
[EXTRACTION END]

Here's the content to extract from:
{content}
"""


def _remove_formatting(text: str) -> str:
    """Clean formatting markers from text."""
    cleaned = re.sub(r"\*\*|\`", "", text)
    cleaned = re.sub(r"^\s*-\s*", "", cleaned, flags=re.MULTILINE)
    return cleaned.strip()


def _parse_extraction_response(response_text: str, template: list[MetadataField]) -> dict:
    """
    Parse the LLM response to extract key-value pairs.
    Expects format: [EXTRACTION START] key:value key:value [EXTRACTION END]
    """
    # Find the extraction block
    match = re.search(r"\[EXTRACTION START\](.*?)\[EXTRACTION END\]", response_text, re.DOTALL)
    if not match:
        # Fallback: try to parse the whole response as key-value pairs
        extraction_text = response_text
    else:
        extraction_text = match.group(1)

    # Parse key:value lines
    result = {}
    template_keys = {f.key: f for f in template}

    for line in extraction_text.split("\n"):
        line = line.strip()
        if not line or ":" not in line:
            continue

        # Split on first colon
        parts = line.split(":", 1)
        if len(parts) < 2:
            continue

        key = parts[0].strip().lower()
        value = parts[1].strip()

        # Match to template key (case-insensitive)
        matched_key = None
        for template_key in template_keys:
            if template_key.lower() == key:
                matched_key = template_key
                break

        if matched_key:
            result[matched_key] = value if value and value.lower() != "n/a" else "N/A"

    # Fill in missing keys with "N/A"
    for field in template:
        if field.key not in result:
            result[field.key] = "N/A"

    return result


def _resolved_provider() -> str:
    if LLM_PROVIDER in {"ollama", "vllm", "openai"}:
        return LLM_PROVIDER
    if "/v1/chat/completions" in (LLM_API or ""):
        return "vllm"
    return "ollama"


def _build_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    return headers


def _build_payload(system: str, user: str) -> dict:
    provider = _resolved_provider()
    if provider in {"vllm", "openai"}:
        payload = {
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


def _generate_completion(system: str, user: str) -> requests.Response:
    return requests.post(
        LLM_API,
        json=_build_payload(system, user),
        headers=_build_headers(),
        timeout=120,
    )


def _extract_llm_content(payload: dict) -> str:
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "llm_api": LLM_API,
        "llm_provider": _resolved_provider(),
        "model": LLM_MODEL,
        "version": "1.1.0",
    }


@app.post("/extract", response_model=ExtractionResponse)
def extract(body: ExtractionRequest) -> ExtractionResponse:
    """
    Run template-driven data extraction on OCR text.

    - **ocr_text**: Plain text from OCR stage
    - **form_type**: Form identifier (e.g. "form1")
    - **metadata_template**: List of field definitions to extract
    """
    if not body.ocr_text.strip():
        raise HTTPException(status_code=400, detail="ocr_text cannot be empty.")

    if not body.metadata_template:
        raise HTTPException(status_code=400, detail="metadata_template cannot be empty.")

    try:
        user_prompt = _build_prompt_from_template(body.ocr_text, body.metadata_template)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        llm_response = _generate_completion(
            system="You are a precise data extraction specialist. Extract structured information from documents.",
            user=user_prompt,
        )
    except requests.exceptions.ConnectionError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach extraction LLM at {LLM_API}. Is the service running? ({exc})",
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise HTTPException(status_code=504, detail="Extraction LLM request timed out.") from exc

    if not llm_response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Extraction LLM returned {llm_response.status_code}: {llm_response.text[:400]}",
        )

    try:
        llm_content: str = _extract_llm_content(llm_response.json())
        if not llm_content:
            raise ValueError("empty response content")
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected extraction LLM response format: {exc}") from exc

    # Parse the LLM response using the template
    extracted = _parse_extraction_response(llm_content, body.metadata_template)

    return ExtractionResponse(
        status_code=llm_response.status_code,
        form_type=body.form_type,
        extracted_json=extracted,
    )


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("data_extraction_api:app", host="0.0.0.0", port=5001, reload=True)
