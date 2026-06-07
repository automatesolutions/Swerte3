"""Generate black-and-white cartoon puzzles via OpenAI Images (DALL-E 2 = lowest cost tier)."""
from __future__ import annotations

import base64
import hashlib
import io
import logging
from datetime import date

import truststore
truststore.inject_into_ssl()

import httpx
from openai import OpenAI
from PIL import Image

from app.config import Settings

logger = logging.getLogger(__name__)

# Bump when prompt or post-process changes so cached DB rows are regenerated.
PICTURE_ANALYSIS_RENDER_VERSION = 2

# dall-e-2 was sunset by OpenAI; gpt-image-1 is the current model.
DALLE2_IMAGE_SIZES = frozenset({"256x256", "512x512", "1024x1024"})
GPT_IMAGE_SIZES = frozenset({"1024x1024", "1536x1024", "1024x1536", "auto"})

THEMES: list[tuple[str, str]] = [
    (
        "sari_sari",
        "Filipino neighborhood sari-sari store scene: vendor cartoon, hanging price tags, small chalkboard, "
        "window display. Several Arabic digits 0-9 visible on signs, tags, or products.",
    ),
    (
        "komiks_strip",
        "Two or three comic panels with speech bubbles and sound-effect shapes; include readable digits inside "
        "bubbles, signs, or character jerseys. Cartoon line art.",
    ),
    (
        "perya",
        "Carnival or perya booth cartoon: balloons, ticket booth, game counter. Digits on tickets, booth numbers, "
        "and scoreboards.",
    ),
    (
        "school_kalye",
        "Street scene with jeepney or tricycle cartoon silhouette, classroom door number, house numbers, "
        "kids with sports jerseys. Playful cartoon.",
    ),
    (
        "tindahan_istilo",
        "Small grocery or bakery counter cartoon: scale display, receipt, calendar on wall, product stacks "
        "with printed numbers.",
    ),
]


def _theme_for(user_id: int, cal: date) -> tuple[str, str]:
    raw = f"{user_id}|{cal.isoformat()}".encode()
    h = int(hashlib.sha256(raw).hexdigest()[:8], 16)
    return THEMES[h % len(THEMES)]


def _image_api_key(settings: Settings) -> str:
    key = (settings.openai_image_api_key or "").strip()
    if key:
        return key
    return (settings.llm_api_key or "").strip()


def pad_png_b64(
    b64_str: str,
    *,
    margin_ratio: float = 0.1,
    min_margin_px: int = 28,
) -> str:
    """
    Add a uniform white border around the PNG so artwork never sits flush against the file edge.
    DALL-E often draws to the canvas rim; this guarantees visible margin in the app.
    """
    raw = base64.standard_b64decode(b64_str)
    im = Image.open(io.BytesIO(raw))
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    m = max(int(round(max(w, h) * margin_ratio)), min_margin_px)
    canvas = Image.new("RGB", (w + 2 * m, h + 2 * m), (255, 255, 255))
    canvas.paste(im, (m, m))
    out_buf = io.BytesIO()
    canvas.save(out_buf, format="PNG", optimize=True)
    return base64.standard_b64encode(out_buf.getvalue()).decode("ascii")


def _normalize_image_size(model: str, size: str, *, log_label: str) -> str:
    model_l = model.lower()
    allowed = DALLE2_IMAGE_SIZES if model_l in {"dall-e-2", "dalle-2"} else GPT_IMAGE_SIZES
    if size in allowed:
        return size
    fallback = "1024x1024"
    logger.warning(
        "%s: unsupported image size %r for model %s; using %s (allowed: %s)",
        log_label,
        size,
        model,
        fallback,
        ", ".join(sorted(allowed)),
    )
    return fallback


def dalle_bw_b64(
    full_prompt: str,
    settings: Settings,
    *,
    log_label: str,
    size_override: str | None = None,
) -> tuple[str, str]:
    """Run OpenAI Images (gpt-image-1) with a fully composed prompt. Returns (b64, mime)."""
    api_key = _image_api_key(settings)
    if not api_key:
        raise RuntimeError("OpenAI API key not configured (set OPENAI_IMAGE_API_KEY or LLM_API_KEY)")

    model = (settings.openai_image_model or "gpt-image-1").strip()
    size = _normalize_image_size(
        model,
        (size_override or settings.openai_image_size or "1024x1024").strip(),
        log_label=log_label,
    )

    base_url = (settings.openai_image_base_url or "https://api.openai.com/v1").rstrip("/")
    client = OpenAI(api_key=api_key, base_url=base_url)

    gen_kwargs: dict = {
        "model": model,
        "prompt": full_prompt,
        "n": 1,
        "size": size,
    }

    logger.info(
        "%s: dalle model=%s size=%s",
        log_label,
        model,
        gen_kwargs.get("size", "(default)"),
    )

    resp = client.images.generate(**gen_kwargs)
    data = resp.data[0]

    # Newer OpenAI API versions return a URL instead of b64_json.
    if data.b64_json:
        return data.b64_json, "image/png"

    if data.url:
        img_resp = httpx.get(data.url, timeout=30)
        img_resp.raise_for_status()
        raw = img_resp.content
        # Convert to PNG if not already (some models return WEBP/JPEG).
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return base64.standard_b64encode(buf.getvalue()).decode("ascii"), "image/png"

    raise RuntimeError("OpenAI returned no image data (no b64_json or url)")


def generate_bw_cartoon(user_id: int, cal: date, settings: Settings) -> tuple[str, str, str]:
    """Returns (base64_png, mime_type, theme_key)."""
    theme_key, scene = _theme_for(user_id, cal)
    prompt = (
        "B&W cartoon: bold black ink on white, comic style, no color or photo. Digit-spotting puzzle. "
        f"{scene} "
        "Wide empty white margin on all sides (~12% of frame); center art like a postcard; "
        "no figure, digit, sign, or object touches the outer border; digits fully readable. "
        "No 3D. Family-friendly. No gambling."
    )
    b64, mime = dalle_bw_b64(
        prompt,
        settings,
        log_label=f"picture_analysis user={user_id} date={cal}",
    )
    b64 = pad_png_b64(b64)
    return b64, mime, theme_key


def generate_bw_cartoon_scene(scene_description: str, settings: Settings, *, log_label: str) -> tuple[str, str]:
    """Wrap a custom English scene in the same B&W cartoon rules (e.g. math cognitive drawing)."""
    prompt = (
        "Black and white cartoon illustration only: bold black ink lines on white background, "
        "no color, no shading gradients, newspaper comic style. "
        "Cognitive number puzzle: show a clear visual or numeric pattern with the NEXT term missing — use a blank box, "
        "empty dashed outline, or a large question mark only (do not draw the answer digit). "
        f"{scene_description} "
        "Arabic numerals only where earlier terms are shown. "
        "No photorealism, no 3D. Family-friendly. "
        "Do not depict gambling, lottery, or betting."
    )
    return dalle_bw_b64(prompt, settings, log_label=log_label)


def generate_bw_cognitive_matrix_scene(scene_description: str, settings: Settings, *, log_label: str) -> tuple[str, str]:
    """
    Nonverbal cognitive practice sheet: quadrant circles (Tests.com / CogAT-style), not sketches or number grids.
    """
    prompt = (
        "Official nonverbal cognitive ABILITIES PRACTICE TEST figure — technical diagram, NOT an illustration. "
        "Style: flat, clean, like a scanned worksheet from TestingMom or Tests.com matrix items — vector-precise, "
        "uniform line weight, no sketchiness, no hand-drawn marker, no cartoon, no comic ink. "
        "\n\n"
        "LAYOUT (must follow this structure unless scene explicitly varies cell shape to squares with quadrants only):\n"
        "• TOP: exactly THREE equally sized circles in ONE horizontal row. Each circle is divided into FOUR quadrants "
        "by one vertical and one horizontal diameter (plus-sign inside circle). Some quadrants are filled solid black; "
        "others stay white. All three circles obey ONE clear visual rule (e.g. same count/pattern of black quadrants).\n"
        "• A single straight horizontal RULE LINE (black) below the top row, full width of the problem.\n"
        "• BOTTOM: exactly FIVE smaller circles in ONE horizontal row — the answer choices. Same quadrant-cross style. "
        "Each option is visually distinct. Print labels A, B, C, D, E in plain black sans-serif capitals under each circle.\n"
        "\n"
        "FORBIDDEN — do not draw any of these anywhere: Arabic numerals 0-9, rows of digits, arithmetic, "
        "decorative question marks or exclamation marks, speech bubbles, 3D cubes, doodles, faces, objects, fruit, "
        "grids of numbers, handwriting texture, messy strokes.\n"
        "ALLOWED: circles, squares (only as matrix cells with quadrant lines), triangles, dots, dashed empty cell for missing figure. "
        "Only text allowed is A B C D E.\n"
        "\n"
        "Implement this specific puzzle:\n"
        f"{scene_description}\n"
        "Do not indicate which choice is correct. White background. Black ink only. No gray gradients. No color. "
        "No photorealism. No gambling."
    )
    return dalle_bw_b64(prompt, settings, log_label=log_label)


def generate_tests_com_style_cognitive_scene(scene_description: str, settings: Settings, *, log_label: str) -> tuple[str, str]:
    """
    Color cognitive worksheet look similar to common online practice tests (blue borders, yellow fills, white paper).
    DALL·E returns PNG; not strictly black-and-white.
    """
    prompt = (
        "Professional cognitive abilities practice test illustration, clean digital worksheet layout on pure white. "
        "ROYAL BLUE (#1d4ed8) thin outlines for every box, grid, and answer frame. "
        "BRIGHT YELLOW (#facc15) to fill highlighted quadrants or regions inside squares (like standard figure-matrix samples). "
        "Use solid BLACK for filled quadrants in circle or square subdivisions where the item needs black-and-white contrast. "
        "Neat spacing, aligned columns, generous margins, no clutter, no drop shadows. "
        "Only simple geometric patterns: squares split into four quadrants, circles split into quadrants, 3x3 cell figures, "
        "dashed empty cell for the missing answer. "
        "NO Arabic numerals inside puzzle cells. NO arithmetic. "
        "Below the main problem, exactly FIVE smaller choice boxes in one horizontal row, each labeled A B C D E in blue. "
        f"{scene_description} "
        "Do not mark which choice is correct. No photos, no 3D, no gambling."
    )
    return dalle_bw_b64(prompt, settings, log_label=log_label)
