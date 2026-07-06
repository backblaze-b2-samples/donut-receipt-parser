"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useDocuments } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { DocumentStatus, formatMoney } from "./document-status";

export function DocumentList() {
  const { data: docs = [], isLoading, error, refetch } = useDocuments();

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : docs.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No documents yet"
            description="Add a receipt or invoice image to start extracting structured data."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Document
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Submitter
                </TableHead>
                <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="w-[14%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </TableHead>
                <TableHead className="w-[14%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[14%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ingested
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.doc_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/documents/${doc.doc_id}`}
                      className="block truncate text-foreground hover:text-primary hover:underline"
                      title={doc.filename}
                    >
                      {doc.merchant || doc.filename}
                    </Link>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {doc.submitter_id || "—"}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {doc.document_type}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                    {formatMoney(doc.total, doc.currency)}
                  </TableCell>
                  <TableCell>
                    <DocumentStatus status={doc.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(doc.uploaded_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
