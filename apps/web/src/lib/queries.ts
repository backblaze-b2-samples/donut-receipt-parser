"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  correctDocument,
  createDocument,
  deleteDocument,
  deleteFile,
  getDocument,
  getDocuments,
  getFiles,
  getFileStats,
  getIngestActivity,
  getPipelineStats,
  getPreviewUrl,
  getUploadActivity,
  parseBatch,
  parseDocument,
} from "@/lib/api-client";
import type {
  CorrectionRequest,
  DailyUploadCount,
  DocumentDetail,
  DocumentSummary,
  FileMetadata,
  PipelineStats,
} from "@donut-receipt-parser/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  documents: () => [...qk.all, "documents"] as const,
  document: (docId: string) => [...qk.all, "documents", docId] as const,
  pipelineStats: () => [...qk.all, "pipeline-stats"] as const,
  ingestActivity: (days: number) =>
    [...qk.all, "ingest-activity", days] as const,
};

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Documents (Donut receipt/invoice extraction) ---

export function useDocuments() {
  return useQuery<DocumentSummary[], ApiError>({
    queryKey: qk.documents(),
    queryFn: getDocuments,
  });
}

export function useDocument(docId: string | undefined) {
  return useQuery<DocumentDetail, ApiError>({
    queryKey: qk.document(docId ?? ""),
    queryFn: () => getDocument(docId as string),
    enabled: !!docId,
  });
}

export function usePipelineStats() {
  return useQuery<PipelineStats, ApiError>({
    queryKey: qk.pipelineStats(),
    queryFn: getPipelineStats,
  });
}

export function useIngestActivity(days = 7) {
  return useQuery<DailyUploadCount[], ApiError>({
    queryKey: qk.ingestActivity(days),
    queryFn: () => getIngestActivity(days),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      file: File;
      submitterId: string;
      documentType: string;
      onProgress?: (percent: number) => void;
    }) =>
      createDocument(vars.file, vars.submitterId, vars.documentType, vars.onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useParseDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => parseDocument(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useParseBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => parseBatch(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useCorrectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { docId: string; correction: CorrectionRequest }) =>
      correctDocument(vars.docId, vars.correction),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}
