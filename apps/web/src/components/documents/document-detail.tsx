"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReceiptText } from "lucide-react";
import { CorrectFieldsForm } from "./correct-fields-form";
import { DocumentStatus, formatMoney } from "./document-status";
import {
  useDocument,
  useParseDocument,
  useDeleteDocument,
} from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import type { ExtractedData } from "@donut-receipt-parser/shared";

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
}

function ExtractedFields({ data }: { data: ExtractedData }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <FieldRow label="Merchant" value={data.merchant || "— (add via Correct fields)"} />
        <FieldRow label="Date" value={data.date || "—"} />
        <FieldRow label="Subtotal" value={formatMoney(data.subtotal, data.currency)} />
        <FieldRow label="Tax" value={formatMoney(data.tax, data.currency)} />
        <FieldRow label="Total" value={formatMoney(data.total, data.currency)} />
        <FieldRow label="Model device" value={data.device} />
        <FieldRow label="Corrected" value={data.corrected ? "Yes" : "No"} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Line items
        </p>
        {data.line_items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No line items detected.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="w-16 text-xs">Qty</TableHead>
                <TableHead className="w-24 text-right text-xs">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.line_items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="break-words">{item.name || "—"}</TableCell>
                  <TableCell className="tabular-nums">{item.qty || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {item.price || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Line items are read-only in this sample — the finance-critical corrections
          are the header fields above.
        </p>
      </div>
    </div>
  );
}

export function DocumentDetail({ docId }: { docId: string }) {
  const router = useRouter();
  const { data: doc, isLoading, error, refetch } = useDocument(docId);
  const parse = useParseDocument();
  const del = useDeleteDocument();
  const [correctOpen, setCorrectOpen] = useState(false);

  const onParse = async () => {
    try {
      await parse.mutateAsync(docId);
      toast.success("Document parsed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(docId);
      toast.success("Document deleted.");
      router.push("/documents");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (isLoading) {
    return <Skeleton className="h-[420px] w-full" />;
  }
  if (error || !doc) {
    return <ErrorState error={error ?? undefined} onRetry={() => refetch()} />;
  }

  const parsed = doc.status === "parsed";

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Documents
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title truncate">
            {doc.extracted?.merchant || doc.filename}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="capitalize">{doc.document_type}</span>
            <span>·</span>
            <span>{doc.submitter_id || "no submitter"}</span>
            <span>·</span>
            <span>Ingested {formatDate(doc.uploaded_at)}</span>
            <DocumentStatus status={doc.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8" onClick={onParse} disabled={parse.isPending}>
            {parsed ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {parse.isPending ? "Parsing..." : parsed ? "Re-parse" : "Parse"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setCorrectOpen(true)}
            disabled={!parsed}
          >
            <Pencil className="h-3.5 w-3.5" />
            Correct fields
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the raw image and any extracted data for
                  this document from Backblaze B2. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Original document</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {doc.image_url ? (
              <div className="relative h-[480px] w-full overflow-hidden rounded-md border border-border bg-muted/30">
                <Image
                  src={doc.image_url}
                  alt={doc.filename}
                  fill
                  sizes="(max-width: 1024px) 100vw, 500px"
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <EmptyState icon={ReceiptText} title="Image unavailable" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Extracted data</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {!parsed || !doc.extracted ? (
              <EmptyState
                icon={Play}
                title="Not parsed yet"
                description="Run Donut on this document to extract line items, subtotal, tax and total."
                action={
                  <Button size="sm" onClick={onParse} disabled={parse.isPending}>
                    <Play className="h-3.5 w-3.5" />
                    {parse.isPending ? "Parsing..." : "Parse now"}
                  </Button>
                }
              />
            ) : (
              <Tabs defaultValue="fields">
                <TabsList>
                  <TabsTrigger value="fields">Fields</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="fields" className="pt-4">
                  <ExtractedFields data={doc.extracted} />
                </TabsContent>
                <TabsContent value="raw" className="pt-4">
                  <pre className="max-h-[440px] overflow-auto rounded-md border border-border bg-muted/30 p-4 text-xs">
                    {JSON.stringify(doc.extracted.raw, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {doc.extracted && (
        <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Correct fields</DialogTitle>
              <DialogDescription>
                Fix or complete the header fields the model couldn&apos;t infer.
                Saved corrections are written back to B2.
              </DialogDescription>
            </DialogHeader>
            <CorrectFieldsForm
              docId={docId}
              extracted={doc.extracted}
              onSaved={() => setCorrectOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
