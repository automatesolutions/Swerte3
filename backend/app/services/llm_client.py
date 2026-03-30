"""OpenAI-compatible chat client."""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from openai import OpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        s = get_settings()
        self.api_key = api_key or s.llm_api_key
        self.base_url = (base_url or s.llm_base_url or "").rstrip("/") or "https://api.openai.com/v1"
        self.model = model or s.llm_model_name or "gpt-4o-mini"
        if not self.api_key:
            raise ValueError("LLM_API_KEY is not configured")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.35,
        max_tokens: int = 1200,
    ) -> Dict[str, Any]:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            return json.loads(content)
        except Exception as e:
            logger.error("LLM chat_json failed: %s", e)
            raise
