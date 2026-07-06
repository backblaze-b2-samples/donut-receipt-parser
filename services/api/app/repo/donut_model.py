"""Donut (OCR-free document understanding) adapter.

Wraps the `naver-clova-ix/donut-base-finetuned-cord-v2` checkpoint so the rest
of the app never touches `transformers` / `torch` directly — mirroring how
`b2_client.py` contains `boto3`. All heavy imports are LAZY (inside the
functions) so the FastAPI app boots and the non-parse test suite runs without
the ML stack installed and without downloading ~0.8 GB of weights.

Device selection is runtime autodetect: CUDA -> Apple MPS -> CPU, defaulting to
CPU. Donut's `generate` has hit unsupported-op issues on MPS, so a failed MPS
generate falls back to CPU for that call and is logged. CPU inference of a
single receipt is slow (~10-30 s) but always completes.
"""

import functools
import io
import logging
import re

logger = logging.getLogger(__name__)

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"
# CORD-v2 task start token — tells the decoder which schema to emit.
TASK_PROMPT = "<s_cord-v2>"


def get_device() -> str:
    """Return the first available device: cuda -> mps -> cpu (default cpu)."""
    import torch

    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


@functools.lru_cache(maxsize=1)
def _load():
    """Load and cache the processor + model on the autodetected device."""
    from transformers import DonutProcessor, VisionEncoderDecoderModel

    device = get_device()
    logger.info("Loading Donut model %s onto %s", MODEL_NAME, device)
    processor = DonutProcessor.from_pretrained(MODEL_NAME)
    model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)
    model.to(device)
    model.eval()
    return processor, model, device


def run_donut(image_bytes: bytes) -> tuple[dict, str]:
    """Run OCR-free extraction on a document image.

    Returns ``(token2json_dict, device_used)``. ``device_used`` is honest about
    an MPS->CPU fallback. Raises RuntimeError if inference fails on CPU/CUDA.
    """
    import torch
    from PIL import Image

    processor, model, device = _load()

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    pixel_values = processor(image, return_tensors="pt").pixel_values
    decoder_input_ids = processor.tokenizer(
        TASK_PROMPT, add_special_tokens=False, return_tensors="pt"
    ).input_ids

    def _generate(dev: str):
        return model.generate(
            pixel_values.to(dev),
            decoder_input_ids=decoder_input_ids.to(dev),
            max_length=model.decoder.config.max_position_embeddings,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )

    device_used = device
    try:
        with torch.no_grad():
            outputs = _generate(device)
    except (RuntimeError, NotImplementedError) as e:
        if device != "mps":
            raise RuntimeError(f"Donut inference failed on {device}: {e}") from e
        logger.warning("Donut generate failed on MPS (%s); falling back to CPU", e)
        model.to("cpu")
        device_used = "cpu"
        with torch.no_grad():
            outputs = _generate("cpu")

    sequence = processor.batch_decode(outputs.sequences)[0]
    sequence = sequence.replace(processor.tokenizer.eos_token, "").replace(
        processor.tokenizer.pad_token, ""
    )
    # Strip the leading task-start token so token2json sees clean XML-ish tokens.
    sequence = re.sub(r"<.*?>", "", sequence, count=1).strip()

    result = processor.token2json(sequence)
    if not isinstance(result, dict):
        result = {"raw_text": sequence}
    return result, device_used
