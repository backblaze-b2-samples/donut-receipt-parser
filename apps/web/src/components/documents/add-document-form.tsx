"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Dropzone } from "@/components/upload/dropzone";
import { useCreateDocument } from "@/lib/queries";

const schema = z.object({
  submitter_id: z
    .string()
    .min(1, "Submitter ID is required")
    .max(80, "Submitter ID is too long"),
  document_type: z.enum(["receipt", "invoice"]),
});

type Values = z.infer<typeof schema>;

export function AddDocumentForm({
  onCreated,
}: {
  onCreated?: (docId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const create = useCreateDocument();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // Safe default hint: document_type defaults to "receipt" (surfaced via the
    // Select value + description) — never an autofill button.
    defaultValues: { submitter_id: "", document_type: "receipt" },
  });

  const handleFiles = (files: File[]) => {
    const selected = files[0];
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Documents must be an image (JPEG, PNG, WebP or GIF).");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const onSubmit = async (values: Values) => {
    if (!file) {
      toast.error("Add a document image first.");
      return;
    }
    try {
      const res = await create.mutateAsync({
        file,
        submitterId: values.submitter_id,
        documentType: values.document_type,
        onProgress: setProgress,
      });
      toast.success("Document added to the library.");
      form.reset();
      setFile(null);
      setPreview(null);
      setProgress(0);
      onCreated?.(res.doc_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <FormLabel>Document image</FormLabel>
          {preview ? (
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                <Image
                  src={preview}
                  alt="Selected document preview"
                  fill
                  sizes="80px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {file?.name}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <Dropzone
              onFilesSelected={handleFiles}
              onFilesRejected={() => toast.error("That file could not be added.")}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="submitter_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Submitter ID</FormLabel>
              <FormControl>
                <Input placeholder="acct-team-01" {...field} />
              </FormControl>
              <FormDescription>
                Who submitted this document — used to organize the storage key.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="document_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-60">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Defaults to Receipt. Both types are read by the CORD checkpoint.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? `Uploading ${progress}%` : "Add document"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
