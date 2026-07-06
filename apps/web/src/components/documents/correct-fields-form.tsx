"use client";

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
import { useCorrectDocument } from "@/lib/queries";
import type { ExtractedData } from "@donut-receipt-parser/shared";

const schema = z.object({
  merchant: z.string().max(200).optional(),
  date: z.string().max(40).optional(),
  currency: z.enum(["USD", "EUR", "GBP", "JPY", "Other"]),
  document_type: z.enum(["receipt", "invoice"]),
  subtotal: z.string().max(40).optional(),
  tax: z.string().max(40).optional(),
  total: z.string().max(40).optional(),
});

type Values = z.infer<typeof schema>;

export function CorrectFieldsForm({
  docId,
  extracted,
  onSaved,
}: {
  docId: string;
  extracted: ExtractedData;
  onSaved?: () => void;
}) {
  const correct = useCorrectDocument();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      merchant: extracted.merchant ?? "",
      date: extracted.date ?? "",
      currency: extracted.currency ?? "USD",
      document_type: extracted.document_type ?? "receipt",
      subtotal: extracted.subtotal ?? "",
      tax: extracted.tax ?? "",
      total: extracted.total ?? "",
    },
  });

  const onSubmit = async (values: Values) => {
    try {
      await correct.mutateAsync({
        docId,
        correction: {
          merchant: values.merchant || null,
          date: values.date || null,
          currency: values.currency,
          document_type: values.document_type,
          subtotal: values.subtotal || null,
          tax: values.tax || null,
          total: values.total || null,
        },
      });
      toast.success("Corrections saved.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save corrections");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="merchant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Merchant</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Blue Bottle Coffee" {...field} />
              </FormControl>
              <FormDescription>
                Donut&apos;s CORD model can&apos;t reliably read the merchant — fill it in here.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="document_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          {(["subtotal", "tax", "total"] as const).map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="capitalize">{name}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="font-mono tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={correct.isPending}>
            {correct.isPending ? "Saving..." : "Save corrections"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
