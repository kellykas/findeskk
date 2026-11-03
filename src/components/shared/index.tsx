/** Reusable presentation primitives. No business logic lives here. */
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
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
    <div className="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function AccessDenied({ title, description }: { title: string; description: string }) {
  return (
    <Card className="items-center gap-2 rounded-md p-8 text-center shadow-none">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("gap-1 rounded-md p-4 shadow-none", className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tabular text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
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
    <Card className="gap-0 overflow-hidden rounded-md p-0 shadow-none">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
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
        <ul className="divide-y text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3 px-4 py-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
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
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={cn(
                  "px-4 py-2 font-medium",
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
            <tr key={rowKey(r)} className="border-t">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5",
                    c.align === "right" && "text-right",
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
