import { QrCode } from "@/components/shared/QrCode";
import { primaryRoleLabel, staffInitials, type StaffCard } from "@/domain/idCard";
import { t } from "@/domain/i18n";
import { cn } from "@/lib/utils";

interface Props {
  card: StaffCard;
  /** Absolute verification link encoded in both QR codes. */
  link: string;
  logoUrl?: string | undefined;
  primary?: string;
  accent?: string;
  /** Which side to draw; the print dialog prints one side per page. */
  side?: "front" | "back" | "both";
  className?: string | undefined;
}

/** Card width in CSS px; the height follows the CR80 portrait ratio (54 × 85.6 mm). */
export const CARD_PX_WIDTH = 340;

/**
 * The printed card: a portrait front and back. Sized like a CR80 card so the
 * screen preview and the printed page match; the dialog scales this component
 * to millimetres when printing.
 */
export function StaffIdCard({
  card,
  link,
  logoUrl,
  primary = "#16a34a",
  accent = "#facc15",
  side = "both",
  className,
}: Props) {
  const company = card.companyName || t("FinDesk");
  const front = (
    <CardFront card={card} link={link} primary={primary} accent={accent} className={className} />
  );
  const back = (
    <CardBack
      card={card}
      link={link}
      company={company}
      logoUrl={logoUrl}
      primary={primary}
      accent={accent}
      className={className}
    />
  );
  if (side === "front") return front;
  if (side === "back") return back;
  return (
    <div className="flex flex-col gap-3">
      {front}
      {back}
    </div>
  );
}

function Corners({ primary, accent }: { primary: string; accent: string }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-12 h-32 w-40 rotate-[25deg] rounded-[40%]"
        style={{ backgroundColor: primary }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-4 h-24 w-32 rotate-[25deg] rounded-[40%]"
        style={{ backgroundColor: accent }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-12 h-32 w-40 -rotate-[25deg] rounded-[40%]"
        style={{ backgroundColor: primary }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-4 h-24 w-32 -rotate-[25deg] rounded-[40%]"
        style={{ backgroundColor: accent }}
      />
    </>
  );
}

function CardFront({
  card,
  link,
  primary,
  accent,
  className,
}: {
  card: StaffCard;
  link: string;
  primary: string;
  accent: string;
  className?: string | undefined;
}) {
  const [firstName, ...rest] = card.displayName.trim().split(/\s+/);
  const surname = rest.join(" ");
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900",
        className,
      )}
      style={{ width: CARD_PX_WIDTH, aspectRatio: "54 / 85.6" }}
    >
      <Corners primary={primary} accent={accent} />

      <div className="relative z-10 flex flex-col items-center px-5 pt-5">
        <div className="h-[118px] w-[118px] overflow-hidden rounded-lg border-2 border-neutral-200 bg-neutral-100">
          {card.photoUrl ? (
            <img
              src={card.photoUrl}
              alt={card.displayName}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-neutral-400">
              {staffInitials(card.displayName)}
            </span>
          )}
        </div>

        <p className="mt-3 text-center text-[17px] font-bold leading-tight">
          <span style={{ color: primary }}>{firstName}</span>{" "}
          <span className="text-neutral-900">{surname}</span>
        </p>
        <p className="mt-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
          {primaryRoleLabel(card.roles)}
        </p>
      </div>

      <div className="relative z-10 mt-4 space-y-1 px-6 text-[10px] leading-snug text-neutral-800">
        <p>
          <span className="font-bold">{t("ID NO.")}</span>{" "}
          <span className="font-mono">{card.staffCode || "—"}</span>
        </p>
        <p>
          <span className="font-bold">{t("EMAIL.")}</span> {card.email || "—"}
        </p>
        <p>
          <span className="font-bold">{t("PHONE.")}</span> {card.phone || "—"}
        </p>
        {!card.active ? (
          <p className="font-semibold text-red-700">{t("No longer active")}</p>
        ) : null}
      </div>

      <div className="relative z-10 mt-auto flex items-end justify-between px-5 pb-6">
        <span
          className="max-w-[120px] truncate text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: primary }}
        >
          {card.companyName || t("FinDesk")}
        </span>
        {link ? (
          <div className="rounded bg-white p-0.5">
            <QrCode value={link} size={48} />
          </div>
        ) : (
          <div className="h-12 w-12 rounded bg-neutral-100" aria-hidden />
        )}
      </div>
    </div>
  );
}

function CardBack({
  card,
  link,
  company,
  logoUrl,
  primary,
  accent,
  className,
}: {
  card: StaffCard;
  link: string;
  company: string;
  logoUrl?: string | undefined;
  primary: string;
  accent: string;
  className?: string | undefined;
}) {
  const address = card.branchAddress || card.companyAddress;
  const officePhone = card.companyPhone;
  const officeEmail = card.companyEmail;
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900",
        className,
      )}
      style={{ width: CARD_PX_WIDTH, aspectRatio: "54 / 85.6" }}
    >
      <div
        className="relative flex h-[150px] shrink-0 flex-col items-center justify-center rounded-b-[60%] px-6 text-white"
        style={{ backgroundColor: primary }}
      >
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-9 w-9 rounded-md bg-white object-contain p-0.5"
              crossOrigin="anonymous"
            />
          ) : null}
          <span className="text-center text-[15px] font-bold uppercase leading-tight tracking-wide">
            {company}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pt-3">
        <p className="text-center text-[11px] font-semibold text-neutral-800">
          {t("If this card is found, please, Inform:")}
        </p>
        <p className="mt-1 text-center text-[10px] leading-snug text-neutral-700">
          {address || "—"}
        </p>

        <div className="mt-3 self-stretch space-y-0.5 text-[10px] text-neutral-800">
          <p>
            <span className="font-bold">{t("Office:")}</span> {officePhone || "—"}
          </p>
          <p>
            <span className="font-bold">{t("Email:")}</span> {officeEmail || "—"}
          </p>
        </div>

        <div className="mt-4">
          {link ? (
            <QrCode value={link} size={96} />
          ) : (
            <div className="h-24 w-24 rounded bg-neutral-100" aria-hidden />
          )}
        </div>
      </div>

      <Corners primary={primary} accent={accent} />
    </div>
  );
}
