"""Documents service — orchestrates the Document primary entity (CRUD + run).

Reads/writes go through the repo layer; the parse (run) verb delegates to the
extraction service. No database: B2 is the sole store and doc_ids correlate the
raw-documents/ and extracted/ prefixes.
"""

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from app.repo import (
    delete_file,
    get_file_metadata,
    get_presigned_url,
    list_files,
    put_object_bytes,
)
from app.service.extraction import (
    EXTRACTED_PREFIX,
    RAW_PREFIX,
    DocumentError,
    DocumentNotFoundError,
    build_raw_key,
    doc_id_for_key,
    extract_and_store,
    find_extracted,
    index_extracted,
    new_run_id,
    parse_document,
    parse_raw_key,
    read_extracted,
    resolve_source_key,
    validate_doc_id,
    write_extracted,
    write_manifest,
)
from app.types import (
    CorrectionRequest,
    DailyUploadCount,
    DocumentCreateResponse,
    DocumentDetail,
    DocumentSummary,
    ExtractedData,
    ParseBatchResponse,
    ParseResponse,
    PipelineStats,
    RecentExtraction,
)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


def create_document(
    image_bytes: bytes,
    filename: str,
    content_type: str,
    submitter_id: str,
    document_type: str,
) -> DocumentCreateResponse:
    """Store a raw document image under raw-documents/ (the create verb)."""
    if not image_bytes:
        raise DocumentError("Empty file")
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise DocumentError(
            f"Unsupported image type '{content_type}'. Upload a JPEG, PNG, WebP or GIF.",
            status_code=415,
        )
    if document_type not in ("receipt", "invoice"):
        raise DocumentError("document_type must be 'receipt' or 'invoice'")

    raw_key = build_raw_key(submitter_id, document_type, filename or "document")
    meta = parse_raw_key(raw_key)
    put_object_bytes(
        image_bytes,
        raw_key,
        content_type,
        metadata={"document-type": document_type, "submitter-id": meta["submitter_id"]},
    )
    doc_id = doc_id_for_key(raw_key)
    logger.info("Document ingested doc_id=%s key=%s", doc_id, raw_key)
    return DocumentCreateResponse(
        doc_id=doc_id,
        source_key=raw_key,
        filename=meta["filename"],
        document_type=meta["document_type"],
        submitter_id=meta["submitter_id"],
    )


def list_documents() -> list[DocumentSummary]:
    """List every raw document merged with its parse status (the read verb)."""
    index = index_extracted()
    summaries: list[DocumentSummary] = []
    for meta in list_files(prefix=RAW_PREFIX, max_keys=1000):
        doc_id = doc_id_for_key(meta.key)
        parsed = parse_raw_key(meta.key)
        status = "parsed" if doc_id in index else "unparsed"
        merchant = total = currency = parsed_at = None
        if status == "parsed":
            try:
                data = read_extracted(index[doc_id])
                merchant, total = data.merchant, data.total
                currency, parsed_at = data.currency, data.parsed_at
            except Exception:
                logger.warning("Failed to read extracted %s", index[doc_id])
        summaries.append(
            DocumentSummary(
                doc_id=doc_id,
                source_key=meta.key,
                filename=parsed["filename"],
                document_type=parsed["document_type"],
                submitter_id=parsed["submitter_id"],
                uploaded_at=meta.uploaded_at.isoformat(),
                size_bytes=meta.size_bytes,
                size_human=meta.size_human,
                status=status,
                merchant=merchant,
                total=total,
                currency=currency,
                parsed_at=parsed_at,
            )
        )
    summaries.sort(key=lambda summary: summary.uploaded_at, reverse=True)
    return summaries


def get_document(doc_id: str) -> DocumentDetail:
    source_key = resolve_source_key(doc_id)
    fmeta = get_file_metadata(source_key)
    parsed = parse_raw_key(source_key)
    extracted = find_extracted(doc_id)
    image_url = get_presigned_url(source_key, filename=parsed["filename"])
    return DocumentDetail(
        doc_id=doc_id,
        source_key=source_key,
        filename=parsed["filename"],
        document_type=parsed["document_type"],
        submitter_id=parsed["submitter_id"],
        uploaded_at=fmeta.uploaded_at.isoformat() if fmeta else "",
        size_bytes=fmeta.size_bytes if fmeta else 0,
        size_human=fmeta.size_human if fmeta else "0 B",
        status="parsed" if extracted else "unparsed",
        image_url=image_url,
        extracted=extracted,
    )


def parse_one(doc_id: str) -> ParseResponse:
    """Run/re-run Donut inference on a single document (the run verb)."""
    data = parse_document(doc_id)
    return ParseResponse(doc_id=doc_id, status="parsed", extracted=data)


def parse_batch() -> ParseBatchResponse:
    """Parse every not-yet-parsed document; one shared run manifest."""
    index = index_extracted()
    run_id = new_run_id("batch")
    entries: list[ExtractedData] = []
    done_ids: list[str] = []
    failed = 0
    for meta in list_files(prefix=RAW_PREFIX, max_keys=1000):
        doc_id = doc_id_for_key(meta.key)
        if doc_id in index:
            continue
        try:
            entries.append(extract_and_store(doc_id, meta.key))
            done_ids.append(doc_id)
        except Exception:
            logger.warning("Batch parse failed for %s", meta.key, exc_info=True)
            failed += 1
    if entries:
        write_manifest(run_id, entries)
    return ParseBatchResponse(
        run_id=run_id, parsed=len(entries), failed=failed, doc_ids=done_ids
    )


def correct_document(doc_id: str, correction: CorrectionRequest) -> ExtractedData:
    """Apply human corrections to scalar header fields (the edit verb)."""
    validate_doc_id(doc_id)
    existing = find_extracted(doc_id)
    if not existing:
        raise DocumentNotFoundError("Document has not been parsed yet")
    updates = correction.model_dump(exclude_unset=True)
    data = existing.model_copy(update=updates)
    data.corrected = True
    write_extracted(data)
    logger.info("Document corrected doc_id=%s", doc_id)
    return data


def delete_document(doc_id: str) -> None:
    """Delete the raw image AND extracted JSON for this doc-id only (delete verb)."""
    validate_doc_id(doc_id)
    source_key = resolve_source_key(doc_id)
    delete_file(source_key)
    ext_key = index_extracted().get(doc_id)
    if ext_key:
        delete_file(ext_key)
    logger.info("Document deleted doc_id=%s", doc_id)


def _recent_extractions(limit: int = 8) -> list[RecentExtraction]:
    metas = [
        m
        for m in list_files(prefix=EXTRACTED_PREFIX, max_keys=1000)
        if m.key.endswith(".json")
    ]
    metas.sort(key=lambda m: m.uploaded_at, reverse=True)
    out: list[RecentExtraction] = []
    for meta in metas[:limit]:
        try:
            data = read_extracted(meta.key)
        except Exception:
            continue
        out.append(
            RecentExtraction(
                doc_id=data.doc_id,
                document_type=data.document_type,
                merchant=data.merchant,
                total=data.total,
                currency=data.currency,
                parsed_at=data.parsed_at,
            )
        )
    return out


def get_pipeline_stats() -> PipelineStats:
    raw = list_files(prefix=RAW_PREFIX, max_keys=1000)
    index = index_extracted()
    ingested = len(raw)
    parsed = sum(1 for meta in raw if doc_id_for_key(meta.key) in index)
    unparsed = ingested - parsed
    coverage = round((parsed / ingested) * 100, 1) if ingested else 0.0
    return PipelineStats(
        documents_ingested=ingested,
        documents_parsed=parsed,
        documents_unparsed=unparsed,
        parse_coverage=coverage,
        recent_extractions=_recent_extractions(),
    )


def get_ingest_activity(days: int = 7) -> list[DailyUploadCount]:
    files = list_files(prefix=RAW_PREFIX, max_keys=1000)
    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days - 1)
    counts: dict[str, int] = defaultdict(int)
    for f in files:
        day = f.uploaded_at.date()
        if day >= cutoff:
            counts[day.isoformat()] += 1
    return [
        DailyUploadCount(
            date=(cutoff + timedelta(days=i)).isoformat(),
            uploads=counts.get((cutoff + timedelta(days=i)).isoformat(), 0),
        )
        for i in range(days)
    ]
