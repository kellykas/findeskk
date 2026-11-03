/** Reusable presentation primitives. No business logic lives here. */
import type { ReactNode } from "react";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AccessDenied({ title, description }: { title: string; description: string }) {
  return (
    <Card className="items-center gap-2 rounded-2xl p-10 text-center shadow-none">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <ShieldAlert className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}

/**
 * A headline figure. `delta` is a preformatted change such as "+12.1%" and
 * `tone` says whether that change is good or bad for this particular figure —
 * a fall in expenses is a positive tone, a fall in income is not.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  tone = "positive",
  className,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  delta?: string | undefined;
  tone?: "positive" | "negative" | undefined;
  className?: string | undefined;
}) {
  return (
    <Card
      className={cn(
        "group gap-0 rounded-2xl border-border/70 p-5 shadow-none transition-shadow hover:shadow-[0_10px_30px_-18px_oklch(0.42_0.14_300/0.5)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="tabular mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {delta && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              tone === "positive"
                ? "bg-success/12 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {delta}
          </span>
        )}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-none">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Honest list of capabilities a module does not have yet. */
export function PlannedNext({ features }: { features: string[] }) {
  if (features.length === 0) return null;
  return (
    <div className="mt-6">
      <SectionCard title="Planned next">
        <ul className="divide-y divide-border/60 text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3 px-5 py-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
              {feature}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.header}
                className={cn(
                  "whitespace-nowrap px-5 py-2 font-medium",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className="border-t border-border/60 transition-colors hover:bg-muted/40"
            >
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn(
                    "whitespace-nowrap px-5 py-3",
                    c.align === "right" && "text-right tabular",
                  )}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
