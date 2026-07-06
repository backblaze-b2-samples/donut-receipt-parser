import logging

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile

from app.config import settings
from app.service.documents import (
    correct_document,
    create_document,
    delete_document,
    get_document,
    get_ingest_activity,
    get_pipeline_stats,
    list_documents,
    parse_batch,
    parse_one,
)
from app.service.extraction import DocumentError
from app.types import (
    CorrectionRequest,
    DailyUploadCount,
    DocumentCreateResponse,
    DocumentDetail,
    DocumentSummary,
    ParseBatchResponse,
    ParseResponse,
    PipelineStats,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _raise(err: DocumentError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from None


async def _read_upload(request: Request, file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_file_size:
            raise HTTPException(status_code=413, detail="File too large")
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/documents", response_model=list[DocumentSummary])
async def list_documents_endpoint():
    return list_documents()


@router.post("/documents", response_model=DocumentCreateResponse)
async def create_document_endpoint(
    request: Request,
    file: UploadFile,
    submitter_id: str = Form(""),
    document_type: str = Form("receipt"),
):
    image_bytes = await _read_upload(request, file)
    try:
        result = create_document(
            image_bytes=image_bytes,
            filename=file.filename or "",
            content_type=file.content_type or "application/octet-stream",
            submitter_id=submitter_id,
            document_type=document_type,
        )
    except DocumentError as e:
        _raise(e)
    logger.info("Document created: doc_id=%s", result.doc_id)
    return result


@router.get("/documents/stats", response_model=PipelineStats)
async def pipeline_stats_endpoint():
    return get_pipeline_stats()


@router.get("/documents/activity", response_model=list[DailyUploadCount])
async def ingest_activity_endpoint(days: int = 7):
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 90")
    return get_ingest_activity(days=days)


@router.post("/documents/parse-batch", response_model=ParseBatchResponse)
async def parse_batch_endpoint():
    return parse_batch()


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
async def get_document_endpoint(doc_id: str):
    try:
        return get_document(doc_id)
    except DocumentError as e:
        _raise(e)


@router.post("/documents/{doc_id}/parse", response_model=ParseResponse)
async def parse_document_endpoint(doc_id: str):
    try:
        return parse_one(doc_id)
    except DocumentError as e:
        _raise(e)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None


@router.patch("/documents/{doc_id}", response_model=DocumentDetail)
async def correct_document_endpoint(doc_id: str, correction: CorrectionRequest):
    try:
        correct_document(doc_id, correction)
        return get_document(doc_id)
    except DocumentError as e:
        _raise(e)


@router.delete("/documents/{doc_id}")
async def delete_document_endpoint(doc_id: str):
    try:
        delete_document(doc_id)
    except DocumentError as e:
        _raise(e)
    return {"deleted": True, "doc_id": doc_id}
