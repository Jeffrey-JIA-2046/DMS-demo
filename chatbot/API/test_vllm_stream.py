import json
import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")


def remove_think(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"</?think>", "", text)
    return text.strip()


def _load_think_tag_token_ids() -> set[int]:
    raw = os.getenv("LLM_THINK_TAG_TOKEN_IDS", "248069")
    result: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            result.add(int(part))
        except ValueError:
            continue
    return result


def _extract_token_ids(data: dict[str, object]) -> set[int]:
    tokens = data.get("tokens")
    if not isinstance(tokens, list):
        return set()

    result: set[int] = set()
    for item in tokens:
        try:
            result.add(int(item))
        except (TypeError, ValueError):
            continue
    return result


def _strip_think_stream_chunk(chunk: str, data: dict[str, object], token_ids_for_think: set[int], state: dict[str, bool]) -> str:
    if not chunk:
        return ""

    token_ids = _extract_token_ids(data)
    if token_ids_for_think and token_ids.intersection(token_ids_for_think):
        if "</think>" in chunk:
            state["in_think"] = False
        elif "<think>" in chunk:
            state["in_think"] = True
        return ""

    text = chunk

    if state.get("in_think", False):
        if "</think>" not in text:
            return ""
        _, _, text = text.partition("</think>")
        state["in_think"] = False

    if "<think>" not in text:
        return text

    before, _, rest = text.partition("<think>")
    if "</think>" in rest:
        _, _, after = rest.partition("</think>")
        return before + after

    state["in_think"] = True
    return before


def load_messages_from_txt(file_path: Path) -> list[dict[str, str]]:
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Message file not found: {file_path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in message file: {file_path}") from exc

    if not isinstance(data, list):
        raise ValueError("Message file must contain a JSON array")

    normalized: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip()
        content = str(item.get("content", ""))
        if role and content:
            normalized.append({"role": role, "content": content})

    if not normalized:
        raise ValueError("No valid messages found in message file")

    return normalized


def _resolved_provider(provider: str, url: str) -> str:
    p = (provider or "").strip().lower()
    if p in {"ollama", "vllm", "openai", "completion", "llamacpp", "llama_cpp"}:
        if p in {"llamacpp", "llama_cpp"}:
            return "completion"
        return p
    if "/v1/chat/completions" in (url or ""):
        return "vllm"
    if "/completion" in (url or ""):
        return "completion"
    return "ollama"


def _messages_to_completion_prompt(messages: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for msg in messages:
        role = str(msg.get("role") or "").strip().lower()
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            lines.append(f"System: {content}")
        elif role == "assistant":
            lines.append(f"Assistant: {content}")
        else:
            lines.append(f"User: {content}")
    lines.append("Assistant:")
    return "\n\n".join(lines)


def test_stream(messages: list[dict[str, str]]) -> None:
    url = os.getenv("LLM_API", "http://localhost:11434/api/chat").strip()
    provider = _resolved_provider(os.getenv("LLM_PROVIDER", "auto"), url)
    model = os.getenv("LLM_MODEL", "qwen3.5:27b").strip() or "qwen3.5:27b"
    max_tokens = int(os.getenv("LLM_MAX_TOKENS", "500"))
    temperature = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    top_p = float(os.getenv("LLM_TOP_P", "0.7"))
    think_tag_token_ids = _load_think_tag_token_ids()

    if provider in {"vllm", "openai"}:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
    elif provider == "completion":
        payload = {
            "prompt": _messages_to_completion_prompt(messages),
            "n_predict": max_tokens,
            "stream": True,
            "temperature": temperature,
            "top_p": top_p,
        }
    else:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": False,
            "parameters": {
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        }

    print(f"Sending stream request to {provider}...")
    print(f"URL: {url}")
    print("=" * 60)

    full_response = ""
    strip_state = {"in_think": False}
    try:
        with requests.post(url, json=payload, stream=True, timeout=90) as response:
            if response.status_code != 200:
                print(f"Request failed, HTTP {response.status_code}")
                print(response.text)
                return

            for line in response.iter_lines():
                if not line:
                    continue

                decoded = line.decode("utf-8")
                if provider in {"vllm", "openai", "completion"}:
                    if not decoded.startswith("data: "):
                        if provider in {"vllm", "openai"}:
                            continue
                        data_str = decoded
                    else:
                        data_str = decoded[6:]
                    if data_str == "[DONE]":
                        print("\n" + "=" * 60)
                        break
                else:
                    data_str = decoded

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                if provider in {"vllm", "openai"}:
                    choices = data.get("choices") if isinstance(data.get("choices"), list) else []
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {}) if isinstance(choices[0], dict) else {}
                    content = str(delta.get("content") or "")
                elif provider == "completion":
                    content = str(
                        data.get("content")
                        or data.get("token")
                        or data.get("completion")
                        or data.get("response")
                        or ""
                    )
                    content = _strip_think_stream_chunk(content, data, think_tag_token_ids, strip_state)
                else:
                    msg = data.get("message") if isinstance(data.get("message"), dict) else {}
                    content = str(msg.get("content") or "")

                if content:
                    print(content, end="", flush=True)
                    full_response += content

        cleaned = remove_think(full_response)
        print("\n\nCleaned response:")
        print("-" * 60)
        print(cleaned)
        print("-" * 60)

    except requests.exceptions.ConnectionError:
        print("Cannot connect to LLM server. Confirm host/port.")
    except Exception as exc:  # noqa: BLE001
        print(f"Unexpected error: {exc}")


if __name__ == "__main__":
    message_file = Path(__file__).with_name("messages.txt")
    messages = load_messages_from_txt(message_file)
    test_stream(messages=messages)
