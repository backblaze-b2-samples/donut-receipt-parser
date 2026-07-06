"""Extraction service — orchestrates the OCR-free parse pipeline.

Flow: read image bytes (b2 repo) -> Donut inference (donut repo) -> map the raw
CORD-v2 dict to the normalized schema -> write extracted/<y>/<m>/<doc_id>.json
and a per-run JSONL manifest (b2 repo). Also owns the storage helpers for the
extracted/ prefix so both this module and documents.py stay DRY.

`doc_id` is a deterministic hash of the raw object key, so raw-documents/ and
extracted/ correlate with no database — B2 is the sole store.
"""

import hashlib
import json
import logging
import re
from datetime import UTC, datetime

from app.repo import (
    get_object_bytes,
    list_files,
    put_object_bytes,
    run_donut,
)
from app.types import ExtractedData, LineItem

logger = logging.getLogger(__name__)

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"
RAW_PREFIX = "raw-documents/"
EXTRACTED_PREFIX = "extracted/"
MANIFEST_PREFIX = "manifests/"

_DOC_ID_RE = re.compile(r"^[a-f0-9]{8,40}$")
_SAFE_SEGMENT_RE = re.compile(r"[^\w.-]")
_TS_PREFIX_RE = re.compile(r"^\d{8}T\d{6}Z-(.+)$")


class DocumentError(Exception):
    """Raised on invalid document input."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class DocumentNotFoundError(DocumentError):
    def __init__(self, detail: str = "Document not found"):
        super().__init__(detail, status_code=404)


# --- key / id conventions -------------------------------------------------

def doc_id_for_key(raw_key: str) -> str:
    """Deterministic 16-char id derived from the raw object key."""
    return hashlib.sha1(raw_key.encode("utf-8"), usedforsecurity=False).hexdigest()[:16]


def validate_doc_id(doc_id: str) -> None:
    if not _DOC_ID_RE.match(doc_id):
        raise DocumentError("Invalid document id")


def sanitize_segment(value: str, fallback: str) -> str:
    cleaned = _SAFE_SEGMENT_RE.sub("-", value.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-.")
    return cleaned[:80] or fallback


def build_raw_key(submitter_id: str, document_type: str, filename: str) -> str:
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    sub = sanitize_segment(submitter_id, "anonymous")
    name = sanitize_segment(filename, "document")
    return f"{RAW_PREFIX}{sub}/{document_type}/{ts}-{name}"


def parse_raw_key(raw_key: str) -> dict:
    rest = raw_key[len(RAW_PREFIX):] if raw_key.startswith(RAW_PREFIX) else raw_key
    parts = rest.split("/")
    submitter_id = parts[0] if parts else ""
    document_type = parts[1] if len(parts) > 1 else "receipt"
    if document_type not in ("receipt", "invoice"):
        document_type = "receipt"
    last = parts[-1] if parts else raw_key
    match = _TS_PREFIX_RE.match(last)
    filename = match.group(1) if match else last
    return {
        "submitter_id": submitter_id,
        "document_type": document_type,
        "filename": filename,
    }


def _extracted_key(doc_id: str, parsed_at: datetime) -> str:
    return f"{EXTRACTED_PREFIX}{parsed_at.year:04d}/{parsed_at.month:02d}/{doc_id}.json"


def key_from_extracted(data: ExtractedData) -> str:
    dt = datetime.fromisoformat(data.parsed_at.replace("Z", "+00:00"))
    return _extracted_key(data.doc_id, dt)


# --- CORD-v2 mapping ------------------------------------------------------

def _first(source: dict, *keys: str) -> str | None:
    for key in keys:
        if isinstance(source, dict) and source.get(key) not in (None, ""):
            return str(source[key])
    return None


def map_cord(raw: dict) -> dict:
    """Map the raw Donut CORD-v2 token2json dict to normalized fields."""
    menu = raw.get("menu")
    if isinstance(menu, dict):
        menu = [menu]
    items: list[LineItem] = []
    if isinstance(menu, list):
        for entry in menu:
            if not isinstance(entry, dict):
                continue
            items.append(
                LineItem(
                    name=_first(entry, "nm", "name"),
                    qty=_first(entry, "cnt", "qty", "count"),
                    price=_first(entry, "price", "unitprice"),
                )
            )
    sub = raw.get("sub_total") if isinstance(raw.get("sub_total"), dict) else {}
    total = raw.get("total") if isinstance(raw.get("total"), dict) else {}
    return {
        "line_items": items,
        "subtotal": _first(sub, "subtotal_price", "subtotal"),
        "tax": _first(sub, "tax_price", "tax"),
        "total": _first(total, "total_price", "total", "cashprice"),
    }


# --- extracted/ storage helpers ------------------------------------------

def index_extracted() -> dict[str, str]:
    """Return {doc_id: extracted_key} for every extracted/**/<id>.json object."""
    index: dict[str, str] = {}
    for meta in list_files(prefix=EXTRACTED_PREFIX, max_keys=1000):
        if meta.key.endswith(".json"):
            doc_id = meta.key.rsplit("/", 1)[-1][: -len(".json")]
            index[doc_id] = meta.key
    return index


def read_extracted(key: str) -> ExtractedData:
    payload = json.loads(get_object_bytes(key).decode("utf-8"))
    return ExtractedData(**payload)


def find_extracted(doc_id: str) -> ExtractedData | None:
    key = index_extracted().get(doc_id)
    return read_extracted(key) if key else None


def write_extracted(data: ExtractedData) -> str:
    key = key_from_extracted(data)
    put_object_bytes(
        json.dumps(data.model_dump(), indent=2).encode("utf-8"),
        key,
        "application/json",
    )
    return key


# --- parse + manifest -----------------------------------------------------

def resolve_source_key(doc_id: str) -> str:
    validate_doc_id(doc_id)
    for meta in list_files(prefix=RAW_PREFIX, max_keys=1000):
        if doc_id_for_key(meta.key) == doc_id:
            return meta.key
    raise DocumentNotFoundError()


def extract_and_store(doc_id: str, source_key: str) -> ExtractedData:
    """Run Donut on the raw image and persist the extracted JSON (no manifest)."""
    meta = parse_raw_key(source_key)
    image_bytes = get_object_bytes(source_key)
    raw, device = run_donut(image_bytes)
    mapped = map_cord(raw)
    parsed_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    data = ExtractedData(
        doc_id=doc_id,
        source_key=source_key,
        document_type=meta["document_type"],
        submitter_id=meta["submitter_id"],
        parsed_at=parsed_at,
        model=MODEL_NAME,
        device=device,
        currency="USD",
        line_items=mapped["line_items"],
        subtotal=mapped["subtotal"],
        tax=mapped["tax"],
        total=mapped["total"],
        raw=raw,
        corrected=False,
    )
    write_extracted(data)
    logger.info("Parsed document doc_id=%s device=%s", doc_id, device)
    return data


def _manifest_line(run_id: str, data: ExtractedData) -> dict:
    return {
        "run_id": run_id,
        "doc_id": data.doc_id,
        "source_key": data.source_key,
        "extracted_key": key_from_extracted(data),
        "document_type": data.document_type,
        "parsed_at": data.parsed_at,
        "device": data.device,
        "total": data.total,
    }


def write_manifest(run_id: str, entries: list[ExtractedData]) -> str:
    """Write one JSONL manifest object per run (S3 has no append)."""
    body = "".join(
        json.dumps(_manifest_line(run_id, entry)) + "\n" for entry in entries
    )
    key = f"{MANIFEST_PREFIX}{run_id}.jsonl"
    put_object_bytes(body.encode("utf-8"), key, "application/x-ndjson")
    return key


def new_run_id(suffix: str = "") -> str:
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{ts}-{suffix}" if suffix else ts


def parse_document(doc_id: str) -> ExtractedData:
    """Parse a single document end-to-end and write a one-line manifest."""
    source_key = resolve_source_key(doc_id)
    data = extract_and_store(doc_id, source_key)
    write_manifest(new_run_id(doc_id), [data])
    return data
