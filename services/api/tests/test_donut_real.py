"""Opt-in real end-to-end Donut inference test.

Skipped by default so the standard `pnpm test:api` needs neither torch nor a
~0.8 GB model download. Run it to verify the real pins / model actually work:

    RUN_DONUT_REAL=1 .venv/bin/python -m pytest tests/test_donut_real.py -v -s

It synthesizes a receipt image at runtime (no committed binary asset), runs the
real model, and asserts a dict comes back.
"""

import io
import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_DONUT_REAL"),
    reason="set RUN_DONUT_REAL=1 to run the real Donut model (downloads weights)",
)


def _synthetic_receipt() -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (480, 640), "white")
    draw = ImageDraw.Draw(img)
    lines = [
        "BLUE BOTTLE COFFEE",
        "123 Market St",
        "",
        "Latte            4.50",
        "Muffin x2        6.00",
        "",
        "Subtotal        10.50",
        "Tax              0.84",
        "TOTAL           11.34",
    ]
    y = 30
    for line in lines:
        draw.text((30, y), line, fill="black")
        y += 40
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_real_donut_returns_dict():
    from app.repo import donut_model

    result, device = donut_model.run_donut(_synthetic_receipt())
    assert isinstance(result, dict)
    assert device in ("cpu", "mps", "cuda")
    print("\nDonut device:", device)  # noqa: T201 — diagnostic output for the opt-in run
    print("Donut token2json:", result)  # noqa: T201
