import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { PERMISSIONS, ROLE_PERMISSIONS, isStaffAdmin, isSuperAdmin } from "@/domain/access";
import { BRAND_COLORS, brandInitials, readableInk } from "@/domain/branding";
import { RESET_PHRASE, resetConfirmationMatches } from "@/domain/reset";
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
import { resetCompanyData } from "@/services/admin.service";
import { uploadLogo } from "@/services/branding.service";
import { settingsQuery, updateSettings } from "@/services/settings.service";
import { cn } from "@/lib/utils";

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
  const superAdmin = Boolean(viewer && isSuperAdmin(viewer.roles));
  const settings = useQuery({ ...settingsQuery, enabled: canRead });
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CompanySettingsForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetText, setResetText] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const loaded = settings.data;
  useEffect(() => {
    if (loaded && !form) setForm(toSettingsForm(loaded));
  }, [loaded, form]);

  const save = useMutation({
    mutationFn: (values: CompanySettingsForm) => updateSettings(values),
    onSuccess: () => {
      toast.success("Company settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      // The shell, the sign-in screen and the tab title read branding separately.
      void queryClient.invalidateQueries({ queryKey: ["branding"] });
      setError(null);
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  // Irreversible, so the database re-checks the role and the typed phrase rather
  // than trusting this screen.
  const wipe = useMutation({
    mutationFn: () => resetCompanyData(resetText),
    onSuccess: () => {
      toast.success(t("All company data deleted. The book is clean."));
      setResetText("");
      setConfirmReset(false);
      // Every balance, list and receipt on every page is now out of date.
      setForm(null);
      void queryClient.invalidateQueries();
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

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadLogo(file);
      update("logoUrl", url);
      toast.success(t("Logo uploaded. Save branding to publish it."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not upload the logo."));
    } finally {
      setUploading(false);
    }
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
              title={t("Branding")}
              action={
                <span className="text-xs text-muted-foreground">
                  {t("Name, logo and theme colour")}
                </span>
              }
            >
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="settings-app-name">{t("Website name")}</Label>
                  <Input
                    id="settings-app-name"
                    value={form?.appName ?? ""}
                    onChange={(event) => update("appName", event.target.value)}
                    disabled={!editable}
                    maxLength={40}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Shown in the sidebar, the sign-in screen and the browser tab.")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-logo">{t("Logo")}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    {form?.logoUrl ? (
                      <img
                        src={form.logoUrl}
                        alt=""
                        className="h-10 w-10 rounded-xl border border-border/60 bg-card object-contain p-1"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.48_0.2_280)] text-sm font-bold text-primary-foreground">
                        {brandInitials(form?.appName || "FinDesk")}
                      </span>
                    )}
                    <label
                      htmlFor="settings-logo"
                      className={cn(
                        "inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent",
                        (!editable || uploading) && "pointer-events-none opacity-50",
                      )}
                    >
                      {uploading ? t("Uploading…") : t("Upload logo")}
                    </label>
                    <input
                      id="settings-logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogo}
                      disabled={!editable || uploading}
                    />
                    {form?.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => update("logoUrl", "")}
                        disabled={!editable}
                      >
                        {t("Remove logo")}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("PNG, JPEG or WebP, up to 2 MB. A square image looks best.")}
                  </p>
                </div>

                <div className="space-y-3 sm:col-span-2">
                  <Label>{t("Brand colour")}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {BRAND_COLORS.map((colour) => (
                      <button
                        key={colour.hex}
                        type="button"
                        aria-label={colour.label}
                        aria-pressed={form?.themePrimary === colour.hex}
                        onClick={() => update("themePrimary", colour.hex)}
                        disabled={!editable}
                        className={cn(
                          "h-8 w-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-105 disabled:cursor-not-allowed",
                          form?.themePrimary === colour.hex
                            ? "border-foreground"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: colour.hex }}
                      />
                    ))}
                    <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium">
                      {t("Custom")}
                      <input
                        type="color"
                        aria-label={t("Custom brand colour")}
                        value={form?.themePrimary ?? "#7c3aed"}
                        onChange={(event) => update("themePrimary", event.target.value)}
                        disabled={!editable}
                        className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                    </label>
                    <span className="font-mono text-xs text-muted-foreground">
                      {form?.themePrimary ?? ""}
                    </span>
                    <span
                      className="ml-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: form?.themePrimary,
                        color: readableInk(form?.themePrimary ?? "#7c3aed"),
                      }}
                    >
                      {t("Sample")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Buttons, links, the active menu item and charts follow this colour. Text contrast is chosen automatically.",
                    )}
                  </p>
                </div>
              </div>
              {editable && (
                <div className="flex justify-end border-t px-4 py-3">
                  <Button type="submit" size="sm" disabled={save.isPending || !form}>
                    {save.isPending ? "Saving…" : t("Save branding")}
                  </Button>
                </div>
              )}
            </SectionCard>

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

          {superAdmin && (
            <div className="mt-6">
              <SectionCard
                title={t("Delete all data")}
                action={<Badge variant="outline">{t("Super admin only")}</Badge>}
              >
                <div className="space-y-4 px-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "Wipes every transaction, ledger entry, customer, FX rate and audit record so the company starts again with a clean book. Employees, branches, currencies, networks and your branding stay.",
                    )}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="settings-reset-confirm">{t("Type RESET to confirm")}</Label>
                    <Input
                      id="settings-reset-confirm"
                      value={resetText}
                      onChange={(event) => setResetText(event.target.value)}
                      placeholder={RESET_PHRASE}
                      autoComplete="off"
                      spellCheck={false}
                      className="max-w-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end border-t px-4 py-3">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!resetConfirmationMatches(resetText) || wipe.isPending}
                    onClick={() => setConfirmReset(true)}
                  >
                    {wipe.isPending ? t("Deleting…") : t("Delete all data")}
                  </Button>
                </div>
              </SectionCard>
            </div>
          )}

          <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Delete all company data?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "This cannot be undone. Every transaction, ledger entry, customer, FX rate and audit record is deleted permanently. Employees, branches, currencies and branding are kept.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Keep the data")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(event) => {
                    // Stay open while the database works; onSuccess closes it.
                    event.preventDefault();
                    wipe.mutate();
                  }}
                >
                  {t("Yes, delete everything")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
