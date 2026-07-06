import type { ParseStatus } from "@donut-receipt-parser/shared";

/** Shared parse-status pill used by the documents list and detail views. */
export function DocumentStatus({ status }: { status: ParseStatus }) {
  const parsed = status === "parsed";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          parsed ? "bg-[var(--success)]" : "bg-muted-foreground/50"
        }`}
      />
      {parsed ? "Parsed" : "Not parsed"}
    </span>
  );
}

/** Format a currency + amount pair, or an em-dash when absent. */
export function formatMoney(
  amount: string | null | undefined,
  currency?: string | null,
): string {
  if (!amount) return "—";
  return currency && currency !== "Other" ? `${currency} ${amount}` : amount;
}
