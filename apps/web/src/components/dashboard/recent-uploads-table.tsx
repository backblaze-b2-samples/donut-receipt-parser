"use client";

import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePipelineStats } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/components/documents/document-status";

export function RecentExtractionsTable() {
  const { data: stats, isLoading, error, refetch } = usePipelineStats();
  const rows = stats?.recent_extractions ?? [];

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Extractions</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No extractions yet"
            description="Parse a document to see extracted receipts here."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[34%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Merchant
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </TableHead>
                <TableHead className="w-[28%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parsed
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.doc_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/documents/${row.doc_id}`}
                      className="block truncate hover:text-primary hover:underline"
                    >
                      {row.merchant || "Unnamed merchant"}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {row.document_type}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                    {formatMoney(row.total, row.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {row.parsed_at ? formatDate(row.parsed_at) : "—"}
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
