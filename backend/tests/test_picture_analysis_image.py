"""Images API helpers: local fallback and response_format retry."""
from __future__ import annotations

import base64
import io
from datetime import date
from types import SimpleNamespace

from PIL import Image

from app.services.picture_analysis_image import dalle_bw_b64, generate_bw_cartoon, local_bw_puzzle_b64


def test_local_puzzle_is_png():
    b64, mime = local_bw_puzzle_b64(1, date(2026, 10, 3), "sari_sari")
    assert mime == "image/png"
    Image.open(io.BytesIO(base64.b64decode(b64))).verify()


def test_generate_falls_back_when_key_missing():
    settings = SimpleNamespace(
        openai_image_api_key="",
        llm_api_key="",
        openai_image_model="dall-e-2",
        openai_image_size="256x256",
        openai_image_base_url="https://api.openai.com/v1",
    )
    b64, mime, theme = generate_bw_cartoon(9, date(2026, 10, 3), settings)
    assert mime == "image/png"
    assert theme
    Image.open(io.BytesIO(base64.b64decode(b64))).verify()


def test_dalle_retries_without_response_format(monkeypatch):
    png = Image.new("RGB", (8, 8), (255, 255, 255))
    buf = io.BytesIO()
    png.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    calls: list[dict] = []

    class FakeImages:
        def generate(self, **kwargs):
            calls.append(kwargs)
            if "response_format" in kwargs:
                raise RuntimeError("Unknown parameter: 'response_format'.")
            return SimpleNamespace(data=[SimpleNamespace(b64_json=b64, url=None)])

    class FakeClient:
        def __init__(self, **_kwargs):
            self.images = FakeImages()

    monkeypatch.setattr("app.services.picture_analysis_image.OpenAI", FakeClient)
    settings = SimpleNamespace(
        openai_image_api_key="sk-test",
        llm_api_key="",
        openai_image_model="dall-e-2",
        openai_image_size="256x256",
        openai_image_base_url="https://api.openai.com/v1",
    )
    out, mime = dalle_bw_b64("a prompt", settings, log_label="test")
    assert mime == "image/png"
    assert out == b64
    assert len(calls) == 2
    assert "response_format" in calls[0]
    assert "response_format" not in calls[1]
