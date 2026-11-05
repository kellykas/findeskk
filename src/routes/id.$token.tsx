import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { StaffIdCard } from "@/components/employees/StaffIdCard";
import { ROLE_LABELS } from "@/domain/roles";
import { idCardLink, type StaffCard } from "@/domain/idCard";
import { t } from "@/domain/i18n";
import { useBranding } from "@/hooks/use-branding";
import { publicStaffCardQuery } from "@/services/id-card.service";

export const Route = createFileRoute("/id/$token")({
  head: () => ({
    meta: [
      { title: "Employee ID — FinDesk" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Verification page for an employee ID card." },
    ],
  }),
  component: VerifyStaffCard,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What someone sees after scanning the QR code on a printed card. No sign-in,
 * and deliberately minimal: only what the card itself prints.
 */
function VerifyStaffCard() {
  const { token } = Route.useParams();
  const valid = UUID.test(token);
  const branding = useBranding();
  const query = useQuery({ ...publicStaffCardQuery(token), enabled: valid });
  const card = query.data;

  if (!valid || (!query.isPending && !card)) {
    return <Notice text={t("This employee card could not be found.")} />;
  }
  if (query.isPending) return <Notice text={t("Checking employee ID…")} />;
  if (query.isError) return <Notice text={t("This employee card could not be loaded.")} />;

  return <Verification card={card!} logoUrl={branding.logoUrl} primary={branding.primary} />;
}

function Verification({
  card,
  logoUrl,
  primary,
}: {
  card: StaffCard;
  logoUrl: string;
  primary: string;
}) {
  const roles = card.roles.map((role) => ROLE_LABELS[role]).join(" · ") || "Staff";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {card.companyName || t("Employee verification")}
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            {t("Employee verification")}
          </h1>
        </div>

        <div
          className={
            card.active
              ? "rounded-lg border border-emerald-300 bg-emerald-50 p-3"
              : "rounded-lg border border-amber-300 bg-amber-50 p-3"
          }
        >
          <p
            className={
              card.active
                ? "flex items-center gap-2 text-sm font-medium text-emerald-800"
                : "flex items-center gap-2 text-sm font-medium text-amber-900"
            }
          >
            {card.active ? (
              <BadgeCheck className="h-4 w-4" aria-hidden />
            ) : (
              <ShieldAlert className="h-4 w-4" aria-hidden />
            )}
            {card.active ? t("Verified employee") : t("This card is no longer active")}
          </p>
        </div>

        <div className="flex justify-center">
          <StaffIdCard
            card={card}
            link={idCardLink(card.token)}
            logoUrl={logoUrl}
            primary={primary}
          />
        </div>

        <dl className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card text-sm">
          <Row label={t("Name")} value={card.displayName} />
          <Row label={t("Employee ID")} value={card.staffCode || "—"} mono />
          <Row label={t("Role")} value={roles} />
          <Row label={t("Branch")} value={card.branchName || "—"} />
          <Row
            label={t("Status")}
            value={card.active ? t("Active employee") : t("No longer active")}
          />
        </dl>

        <p className="text-center text-xs text-muted-foreground">
          {t(
            "This page is issued by the company that printed the card. It shows only what is printed on the card.",
          )}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs font-medium" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
