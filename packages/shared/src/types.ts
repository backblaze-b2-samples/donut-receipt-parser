export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Donut receipt/invoice extraction ---

export type DocumentType = "receipt" | "invoice";
export type Currency = "USD" | "EUR" | "GBP" | "JPY" | "Other";
export type ParseStatus = "parsed" | "unparsed";

export interface LineItem {
  name: string | null;
  qty: string | null;
  price: string | null;
}

export interface ExtractedData {
  doc_id: string;
  source_key: string;
  document_type: DocumentType;
  submitter_id: string;
  parsed_at: string;
  model: string;
  device: string;
  merchant: string | null;
  date: string | null;
  currency: Currency;
  line_items: LineItem[];
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  raw: Record<string, unknown>;
  corrected: boolean;
}

export interface DocumentSummary {
  doc_id: string;
  source_key: string;
  filename: string;
  document_type: DocumentType;
  submitter_id: string;
  uploaded_at: string;
  size_bytes: number;
  size_human: string;
  status: ParseStatus;
  merchant: string | null;
  total: string | null;
  currency: string | null;
  parsed_at: string | null;
}

export interface DocumentDetail {
  doc_id: string;
  source_key: string;
  filename: string;
  document_type: DocumentType;
  submitter_id: string;
  uploaded_at: string;
  size_bytes: number;
  size_human: string;
  status: ParseStatus;
  image_url: string | null;
  extracted: ExtractedData | null;
}

export interface DocumentCreateResponse {
  doc_id: string;
  source_key: string;
  filename: string;
  document_type: DocumentType;
  submitter_id: string;
}

export interface CorrectionRequest {
  merchant?: string | null;
  date?: string | null;
  currency?: Currency | null;
  document_type?: DocumentType | null;
  subtotal?: string | null;
  tax?: string | null;
  total?: string | null;
}

export interface ParseBatchResponse {
  run_id: string;
  parsed: number;
  failed: number;
  doc_ids: string[];
}

export interface RecentExtraction {
  doc_id: string;
  document_type: DocumentType;
  merchant: string | null;
  total: string | null;
  currency: string | null;
  parsed_at: string | null;
}

export interface PipelineStats {
  documents_ingested: number;
  documents_parsed: number;
  documents_unparsed: number;
  parse_coverage: number;
  recent_extractions: RecentExtraction[];
}
