"use client";

import { useState } from "react";
import { Plus, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddDocumentForm } from "./add-document-form";
import { DocumentList } from "./document-list";
import { useDocuments, useParseBatch } from "@/lib/queries";

export function DocumentsView() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: docs } = useDocuments();
  const parseBatch = useParseBatch();

  const unparsed = (docs ?? []).filter((d) => d.status === "unparsed").length;

  const onParseAll = async () => {
    try {
      const res = await parseBatch.mutateAsync();
      toast.success(
        `Parsed ${res.parsed} document${res.parsed === 1 ? "" : "s"}` +
          (res.failed ? ` — ${res.failed} failed` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Batch parse failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {docs
            ? `${docs.length} document${docs.length === 1 ? "" : "s"} · ${unparsed} awaiting parse`
            : "Loading documents..."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onParseAll}
            disabled={parseBatch.isPending || unparsed === 0}
          >
            <Play className="h-3.5 w-3.5" />
            {parseBatch.isPending
              ? "Parsing..."
              : `Parse all unparsed${unparsed ? ` (${unparsed})` : ""}`}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-3.5 w-3.5" />
                Add document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add document</DialogTitle>
                <DialogDescription>
                  Upload a receipt or invoice image to store it in Backblaze B2.
                </DialogDescription>
              </DialogHeader>
              <AddDocumentForm onCreated={() => setAddOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <DocumentList />
    </div>
  );
}
