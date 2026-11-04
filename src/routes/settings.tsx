import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_REGISTRY, BASE_CURRENCY, getCurrency } from "@/domain/currency";
import { PERMISSIONS, ROLE_PERMISSIONS, isStaffAdmin } from "@/domain/access";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import {
  MONTH_LABELS,
  RECEIPT_FORMATS,
  RECEIPT_FORMAT_LABELS,
  companySettingsSchema,
  toSettingsForm,
  type CompanySettingsForm,
  type ReceiptFormat,
} from "@/domain/settings";
import { useSession } from "@/hooks/use-session";
import { settingsQuery, updateSettings } from "@/services/settings.service";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FinDesk" },
      {
        name: "description",
        content: "Company profile, currencies and the role permission matrix.",
      },
      { property: "og:title", content: "Settings — FinDesk" },
      {
        property: "og:description",
        content: "Company profile, currencies and the role permission matrix.",
      },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { viewer } = useSession();
  const canRead = Boolean(viewer);
  const editable = Boolean(viewer && isStaffAdmin(viewer.roles));
  const settings = useQuery({ ...settingsQuery, enabled: canRead });
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CompanySettingsForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loaded = settings.data;
  useEffect(() => {
    if (loaded && !form) setForm(toSettingsForm(loaded));
  }, [loaded, form]);

  const save = useMutation({
    mutationFn: (values: CompanySettingsForm) => updateSettings(values),
    onSuccess: () => {
      toast.success("Company settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      setError(null);
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (!canRead) {
    return (
      <AppShell>
        <PageHeader
          title={t("Settings")}
          description={t("Company profile, currencies and permissions.")}
        />
        <AccessDenied
          title={t("Settings are restricted")}
          description={t(
            "Sign in to read company settings. Only super admins and the company owner can change them.",
          )}
        />
      </AppShell>
    );
  }

  function update<K extends keyof CompanySettingsForm>(key: K, value: CompanySettingsForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const parsed = companySettingsSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <AppShell>
      <PageHeader
        title={t("Settings")}
        description={t(
          "Company profile, currencies, receipt format and the role permission matrix.",
        )}
        actions={
          <Badge variant={editable ? "secondary" : "outline"}>
            {editable ? "Editable by you" : "Read only"}
          </Badge>
        }
      />

      {settings.isPending && (
        <p className="mb-4 text-sm text-muted-foreground">Loading company settings…</p>
      )}

      {settings.isError && (
        <SectionCard title={t("Settings unavailable")}>
          <div className="space-y-3 px-4 py-6 text-sm">
            <p className="text-destructive">{settings.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void settings.refetch()}>
              Try again
            </Button>
          </div>
        </SectionCard>
      )}

      {loaded && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Company" value={loaded.companyName} />
            <StatCard label="Base currency" value={loaded.baseCurrency} hint="All postings" />
            <StatCard label="Receipt format" value={RECEIPT_FORMAT_LABELS[loaded.receiptFormat]} />
            <StatCard
              label="Currencies"
              value={String(loaded.currencyCodes.length)}
              hint={loaded.currencyCodes.join(", ")}
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <SectionCard
              title="Company profile"
              action={
                <span className="text-xs text-muted-foreground">
                  Updated{" "}
                  {new Date(loaded.updatedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              }
            >
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                {error && (
                  <div
                    role="alert"
                    className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="settings-name">Trading name</Label>
                  <Input
                    id="settings-name"
                    value={form?.companyName ?? ""}
                    onChange={(event) => update("companyName", event.target.value)}
                    disabled={!editable}
                    maxLength={80}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-legal">Legal name</Label>
                  <Input
                    id="settings-legal"
                    value={form?.legalName ?? ""}
                    onChange={(event) => update("legalName", event.target.value)}
                    disabled={!editable}
                    maxLength={120}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-phone">Phone</Label>
                  <Input
                    id="settings-phone"
                    value={form?.phone ?? ""}
                    onChange={(event) => update("phone", event.target.value)}
                    disabled={!editable}
                    maxLength={30}
                    placeholder="+256 …"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input
                    id="settings-email"
                    type="email"
                    value={form?.email ?? ""}
                    onChange={(event) => update("email", event.target.value)}
                    disabled={!editable}
                    maxLength={120}
                    placeholder="accounts@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-tax">Tax number (TIN)</Label>
                  <Input
                    id="settings-tax"
                    value={form?.taxNumber ?? ""}
                    onChange={(event) => update("taxNumber", event.target.value)}
                    disabled={!editable}
                    maxLength={40}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-address">Address</Label>
                  <Input
                    id="settings-address"
                    value={form?.address ?? ""}
                    onChange={(event) => update("address", event.target.value)}
                    disabled={!editable}
                    maxLength={200}
                    placeholder="Kampala, Uganda"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t("Receipts and reporting")}>
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Receipt format</Label>
                  <Select
                    value={form?.receiptFormat ?? loaded.receiptFormat}
                    onValueChange={(value) => update("receiptFormat", value as ReceiptFormat)}
                    disabled={!editable}
                  >
                    <SelectTrigger aria-label="Receipt format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECEIPT_FORMATS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {RECEIPT_FORMAT_LABELS[format]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The default paper size. Each till can switch paper on the receipt itself,
                    because the printer in front of the teller is the one that matters.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Fiscal year starts</Label>
                  <Select
                    value={String(form?.fiscalYearStartMonth ?? loaded.fiscalYearStartMonth)}
                    onValueChange={(value) => update("fiscalYearStartMonth", Number(value))}
                    disabled={!editable}
                  >
                    <SelectTrigger aria-label="Fiscal year start month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((month, index) => (
                        <SelectItem key={month} value={String(index + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="settings-footer">Receipt footer</Label>
                  <Textarea
                    id="settings-footer"
                    value={form?.receiptFooter ?? ""}
                    onChange={(event) => update("receiptFooter", event.target.value)}
                    disabled={!editable}
                    maxLength={200}
                    rows={2}
                    placeholder="Thank you for your business"
                  />
                </div>
              </div>
              {editable && (
                <div className="flex justify-end border-t px-4 py-3">
                  <Button type="submit" size="sm" disabled={save.isPending || !form}>
                    {save.isPending ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              )}
            </SectionCard>
          </form>

          <div className="mt-6">
            <SectionCard
              title="Currencies"
              action={<Badge variant="outline">Base: {BASE_CURRENCY}</Badge>}
            >
              <DataTable
                rows={[...CURRENCY_REGISTRY]}
                rowKey={(currency) => currency.code}
                columns={[
                  {
                    header: "Code",
                    cell: (currency) => (
                      <span className="tabular font-medium">{currency.code}</span>
                    ),
                  },
                  { header: "Name", cell: (currency) => currency.name },
                  {
                    header: "Decimals",
                    align: "right",
                    cell: (currency) => String(getCurrency(currency.code).decimals),
                  },
                  {
                    header: "Status",
                    cell: (currency) =>
                      currency.code === BASE_CURRENCY ? (
                        <Badge variant="secondary">Base currency</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Traded</span>
                      ),
                  },
                ]}
              />
            </SectionCard>
          </div>

          <div className="mt-6">
            <SectionCard
              title="Role permission matrix"
              action={<Badge variant="outline">Interface only</Badge>}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Permission</th>
                      {ROLES.map((role) => (
                        <th key={role} className="px-2 py-2 text-center font-medium">
                          {shortRole(role)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map((permission) => (
                      <tr key={permission} className="border-t">
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs">{permission}</span>
                        </td>
                        {ROLES.map((role) => (
                          <td key={role} className="px-2 py-2 text-center">
                            {ROLE_PERMISSIONS[role].includes(permission) ? (
                              <span className="text-primary" aria-label="granted">
                                ✓
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50" aria-label="denied">
                                ·
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                This matrix shapes the interface only. The database enforces the same rules through
                row-level security and security-definer functions.
              </p>
            </SectionCard>
          </div>
        </>
      )}
    </AppShell>
  );
}

function shortRole(role: Role): string {
  return ROLE_LABELS[role]
    .split(" ")
    .map((word) => word[0])
    .join("");
}
