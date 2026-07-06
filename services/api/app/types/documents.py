"""Pydantic models for the Document primary entity and its extraction schema.

A ``Document`` is a receipt/invoice tracked from raw image -> extracted
structured data. B2 is the sole store: raw images live under ``raw-documents/``
and derived JSON under ``extracted/<year>/<month>/<doc_id>.json``.
"""

from typing import Literal

from pydantic import BaseModel

DocumentType = Literal["receipt", "invoice"]
Currency = Literal["USD", "EUR", "GBP", "JPY", "Other"]
ParseStatus = Literal["parsed", "unparsed"]


class LineItem(BaseModel):
    name: str | None = None
    qty: str | None = None
    price: str | None = None


class ExtractedData(BaseModel):
    """Normalized extraction result stored as extracted/<y>/<m>/<doc_id>.json.

    CORD-v2 reliably emits line items and subtotal/tax/total but NOT merchant
    or date, so those stay null until a human fills them via the edit verb.
    Both the normalized view and the raw Donut dict are persisted.
    """

    doc_id: str
    source_key: str
    document_type: DocumentType = "receipt"
    submitter_id: str = ""
    parsed_at: str
    model: str
    device: str
    merchant: str | None = None
    date: str | None = None
    currency: Currency = "USD"
    line_items: list[LineItem] = []
    subtotal: str | None = None
    tax: str | None = None
    total: str | None = None
    raw: dict = {}
    corrected: bool = False


class DocumentSummary(BaseModel):
    """One row in the scoped /documents explorer."""

    doc_id: str
    source_key: str
    filename: str
    document_type: DocumentType
    submitter_id: str
    uploaded_at: str
    size_bytes: int
    size_human: str
    status: ParseStatus
    merchant: str | None = None
    total: str | None = None
    currency: str | None = None
    parsed_at: str | None = None


class DocumentDetail(BaseModel):
    """Full document view: source metadata + image URL + extraction (if any)."""

    doc_id: str
    source_key: str
    filename: str
    document_type: DocumentType
    submitter_id: str
    uploaded_at: str
    size_bytes: int
    size_human: str
    status: ParseStatus
    image_url: str | None = None
    extracted: ExtractedData | None = None


class DocumentCreateResponse(BaseModel):
    doc_id: str
    source_key: str
    filename: str
    document_type: DocumentType
    submitter_id: str


class CorrectionRequest(BaseModel):
    """PATCH body for the edit verb — scalar header fields only."""

    merchant: str | None = None
    date: str | None = None
    currency: Currency | None = None
    document_type: DocumentType | None = None
    subtotal: str | None = None
    tax: str | None = None
    total: str | None = None


class ParseResponse(BaseModel):
    doc_id: str
    status: ParseStatus
    extracted: ExtractedData


class ParseBatchResponse(BaseModel):
    run_id: str
    parsed: int
    failed: int
    doc_ids: list[str] = []


class RecentExtraction(BaseModel):
    doc_id: str
    document_type: DocumentType
    merchant: str | None = None
    total: str | None = None
    currency: str | None = None
    parsed_at: str | None = None


class PipelineStats(BaseModel):
    documents_ingested: int
    documents_parsed: int
    documents_unparsed: int
    parse_coverage: float
    recent_extractions: list[RecentExtraction] = []
