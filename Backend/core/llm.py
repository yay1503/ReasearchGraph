import json
import os
import re

import httpx

OLLAMA_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://localhost:11434/api/chat")
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

DEFAULT_MODELS = {
    "ollama": DEFAULT_OLLAMA_MODEL,
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "openrouter": "openai/gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
}

OPENAI_COMPAT_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
}


def _extract_error_detail(res: httpx.Response) -> str:
    try:
        payload = res.json()
        if isinstance(payload, dict):
            err = payload.get("error")
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            if isinstance(err, str) and err:
                return err
            if payload.get("detail"):
                return str(payload["detail"])
            if payload.get("message"):
                return str(payload["message"])
    except Exception:
        pass
    return res.text.strip()[:200] or f"HTTP {res.status_code}"


def _raise_for_provider_status(provider: str, res: httpx.Response) -> None:
    if res.status_code in (401, 403):
        detail = _extract_error_detail(res)
        raise ValueError(
            f"Authentication failed ({res.status_code}) for {provider}: {detail}"
        )
    if res.status_code == 429:
        detail = _extract_error_detail(res)
        raise ValueError(f"Rate limit exceeded (429) for {provider}: {detail}")
    if res.status_code >= 400:
        detail = _extract_error_detail(res)
        raise ValueError(f"{provider} request failed ({res.status_code}): {detail}")


async def call_llm(
    prompt: str,
    system_prompt: str = "",
    config: dict | None = None,
    *,
    timeout: float = 120.0,
    json_mode: bool = False,
) -> str:
    cfg = config or {}
    provider = (cfg.get("provider") or "ollama").strip().lower()
    api_key = (cfg.get("api_key") or "").strip()
    model = (cfg.get("model") or "").strip() or DEFAULT_MODELS.get(provider, "")

    if provider not in DEFAULT_MODELS:
        raise ValueError(f"Unsupported LLM provider: '{provider}'")

    if provider != "ollama" and not api_key:
        raise ValueError(f"An API key is required for provider '{provider}'.")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider == "ollama":
                payload = {
                    "model": model,
                    "messages": messages,
                    "stream": False,
                }
                if json_mode:
                    payload["format"] = "json"
                res = await client.post(OLLAMA_CHAT_URL, json=payload)
                _raise_for_provider_status(provider, res)
                data = res.json()
                return str(data["message"]["content"])

            if provider in OPENAI_COMPAT_URLS:
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": model,
                    "messages": messages,
                }
                if json_mode and provider == "openai":
                    payload["response_format"] = {"type": "json_object"}
                res = await client.post(
                    OPENAI_COMPAT_URLS[provider],
                    headers=headers,
                    json=payload,
                )
                _raise_for_provider_status(provider, res)
                data = res.json()
                return str(data["choices"][0]["message"]["content"])

            # Anthropic Messages API
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system_prompt:
                payload["system"] = system_prompt
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=payload,
            )
            _raise_for_provider_status(provider, res)
            data = res.json()
            blocks = data.get("content", [])
            return "".join(
                block.get("text", "")
                for block in blocks
                if isinstance(block, dict) and block.get("type") == "text"
            )
    except httpx.RequestError as exc:
        raise ValueError(f"Could not connect to {provider}: {exc}") from exc


async def call_llm_json(
    prompt: str,
    system_prompt: str = "",
    config: dict | None = None,
    timeout: float = 120.0,
) -> dict:
    raw = await call_llm(
        prompt,
        system_prompt=system_prompt,
        config=config,
        timeout=timeout,
        json_mode=True,
    )
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)
