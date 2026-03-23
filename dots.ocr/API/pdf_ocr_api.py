import os
import json
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from dots_ocr.parser import DotsOCRParser


# Configuration via environment variables.
# Keep MODEL_NAME aligned with your vLLM --served-model-name value.
VLLM_IP = os.getenv("DOTSOCR_VLLM_IP", "127.0.0.1")
VLLM_PORT = int(os.getenv("DOTSOCR_VLLM_PORT", "8001"))
VLLM_MODEL_NAME = os.getenv("DOTSOCR_VLLM_MODEL_NAME", "model")
OUTPUT_DIR = os.getenv("DOTSOCR_OUTPUT_DIR", "./output_api")
NUM_THREAD = int(os.getenv("DOTSOCR_NUM_THREAD", "16"))

app = FastAPI(title="DotsOCR PDF API", version="1.0.0")


# Reuse one parser instance across requests.
parser = DotsOCRParser(
    ip=VLLM_IP,
    port=VLLM_PORT,
    model_name=VLLM_MODEL_NAME,
    num_thread=NUM_THREAD,
    output_dir=OUTPUT_DIR,
)


def _safe_read_text(path: str | None) -> str:
    if not path:
        return ""
    p = Path(path)
    if not p.exists() or not p.is_file():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


def _safe_read_json(path: str | None):
    if not path:
        return []
    p = Path(path)
    if not p.exists() or not p.is_file():
        return []
    try:
        with p.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _enrich_results(raw_results):
    enriched = []
    markdown_pages = []
    for item in raw_results:
        page = dict(item) if isinstance(item, dict) else {"raw": item}
        md_content = _safe_read_text(page.get("md_content_path"))
        md_content_nohf = _safe_read_text(page.get("md_content_nohf_path"))
        cells_data = _safe_read_json(page.get("layout_info_path"))

        if md_content:
            markdown_pages.append(md_content)

        page["md_content"] = md_content
        page["md_content_nohf"] = md_content_nohf
        page["cells_data"] = cells_data
        enriched.append(page)

    preview_markdown = "\n\n---\n\n".join(markdown_pages)
    return enriched, preview_markdown


def _normalize_confidence(confidence: Optional[int]) -> int:
    if confidence is None:
        return 95
    return max(0, min(100, int(confidence)))


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "vllm": {
            "ip": VLLM_IP,
            "port": VLLM_PORT,
            "model_name": VLLM_MODEL_NAME,
        },
    }


@app.post("/ocr/pdf")
async def ocr_pdf(
    file: UploadFile = File(...),
    prompt: str = Form("prompt_layout_all_en"),
    confidence: int = Form(95),
    output_dir: Optional[str] = Form(None),
) -> JSONResponse:
    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    save_dir = output_dir or OUTPUT_DIR
    normalized_confidence = _normalize_confidence(confidence)
    Path(save_dir).mkdir(parents=True, exist_ok=True)

    tmp_path = None
    try:
        # Persist upload to temp path because parse_file expects a file path.
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp_path = tmp.name
            data = await file.read()
            tmp.write(data)

        results = parser.parse_file(
            input_path=tmp_path,
            output_dir=save_dir,
            prompt_mode=prompt,
        )

        enriched_results, preview_markdown = _enrich_results(results)
        for page in enriched_results:
            page["confidence"] = normalized_confidence

        return JSONResponse(
            {
                "ok": True,
                "prompt": prompt,
                "confidence": normalized_confidence,
                "pages": len(results),
                "results": enriched_results,
                "preview_markdown": preview_markdown,
                "output_dir": str(Path(save_dir).resolve()),
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    # Local run: python API/pdf_ocr_api.py
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9000, reload=False)
