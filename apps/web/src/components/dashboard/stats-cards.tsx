"use client";

import { ReceiptText, CheckCircle2, Percent, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { usePipelineStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = usePipelineStats();

  // Surface fetch failures inline rather than rendering "0 / 0" — that lies
  // about the pipeline state when the API is really just unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: "Documents Ingested",
      value: stats?.documents_ingested ?? 0,
      icon: ReceiptText,
    },
    {
      title: "Documents Parsed",
      value: stats?.documents_parsed ?? 0,
      icon: CheckCircle2,
    },
    {
      title: "Parse Coverage",
      value: stats ? `${stats.parse_coverage}%` : "0%",
      icon: Percent,
    },
    {
      title: "Awaiting Parse",
      value: stats?.documents_unparsed ?? 0,
      icon: Clock,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
