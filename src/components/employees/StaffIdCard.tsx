import { QrCode } from "@/components/shared/QrCode";
import { primaryRoleLabel, staffInitials, type StaffCard } from "@/domain/idCard";
import { t } from "@/domain/i18n";
import { cn } from "@/lib/utils";

interface Props {
  card: StaffCard;
  /** Absolute verification link encoded in the QR code. */
  link: string;
  logoUrl?: string;
  primary?: string;
  className?: string;
}

/**
 * The printed card itself. Sized like a CR80 card so what the administrator
 * sees is what the printer produces; the dialog scales this same component to
 * millimetres when printing, so screen and paper cannot drift apart.
 */
export function StaffIdCard({ card, link, logoUrl, primary = "#7c3aed", className }: Props) {
  const company = card.companyName || t("FinDesk");
  return (
    <div
      className={cn(
        "flex w-[340px] flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white text-neutral-900",
        className,
      )}
      style={{ aspectRatio: "85.6 / 54" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 text-white"
        style={{ backgroundColor: primary }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-5 w-5 rounded-sm bg-white object-contain p-0.5"
            crossOrigin="anonymous"
          />
        ) : null}
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]">
          {company}
        </span>
        <span className="ml-auto text-[8px] font-medium uppercase tracking-[0.18em] opacity-90">
          {t("Staff ID")}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
        <div className="h-[74px] w-[60px] shrink-0 overflow-hidden rounded-md border border-neutral-300 bg-neutral-100">
          {card.photoUrl ? (
            <img
              src={card.photoUrl}
              alt={card.displayName}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-neutral-400">
              {staffInitials(card.displayName)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">{card.displayName}</p>
          <p className="mt-0.5 font-mono text-[10px] tracking-wide text-neutral-600">
            {card.staffCode || "—"}
          </p>
          <p className="mt-1 truncate text-[10px] font-medium">{primaryRoleLabel(card.roles)}</p>
          <p className="truncate text-[9px] text-neutral-500">{card.branchName}</p>
          <p
            className={cn(
              "mt-1 text-[9px] font-semibold",
              card.active ? "text-emerald-700" : "text-red-700",
            )}
          >
            {card.active ? t("Active employee") : t("No longer active")}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-center justify-center">
          {link ? (
            <QrCode value={link} size={62} />
          ) : (
            <div className="h-[62px] w-[62px] rounded bg-neutral-100" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
