import { QrCode } from "@/components/shared/QrCode";
import {
  ID_CARD_GOLD,
  ID_CARD_GREEN,
  cardNameFontSize,
  primaryRoleLabel,
  staffInitials,
  type StaffCard,
} from "@/domain/idCard";
import { t } from "@/domain/i18n";
import { cn } from "@/lib/utils";

interface Props {
  card: StaffCard;
  /** Absolute verification link encoded in both QR codes. */
  link: string;
  logoUrl?: string | undefined;
  /** Which side to draw; the print dialog prints one side per page. */
  side?: "front" | "back" | "both";
  className?: string | undefined;
}

/** Card width in CSS px; the height follows the CR80 portrait ratio (54 × 85.6 mm). */
export const CARD_PX_WIDTH = 340;
/** 340 × 85.6 / 54, so scaling by the print dialog lands on exactly 85.6 mm. */
export const CARD_PX_HEIGHT = 539;

/** Matches the app's own family, with the classic grotesque as a fallback. */
const CARD_FONT = '"IBM Plex Sans", Arial, Helvetica, sans-serif';

/**
 * The printed card, built to the approved reference: a portrait CR80 front
 * (photo in a green frame, green name, ID/email/phone block, mark and QR) and a
 * back with the company header, office details and a large QR.
 *
 * Every measurement is in card pixels against {@link CARD_PX_WIDTH}, so the
 * dialog can scale the whole card to millimetres for printing without any
 * element drifting out of place. The colours are the card's own
 * ({@link ID_CARD_GREEN} / {@link ID_CARD_GOLD}), not the screen theme.
 */
export function StaffIdCard({ card, link, logoUrl, side = "both", className }: Props) {
  const company = card.companyName || t("FinDesk");
  const front = (
    <CardFront card={card} link={link} logoUrl={logoUrl} company={company} className={className} />
  );
  const back = (
    <CardBack card={card} link={link} logoUrl={logoUrl} company={company} className={className} />
  );
  if (side === "front") return front;
  if (side === "back") return back;
  return (
    <div className="flex flex-col gap-4">
      {front}
      {back}
    </div>
  );
}

function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn("relative overflow-hidden bg-white text-black", className)}
      style={{
        width: CARD_PX_WIDTH,
        height: CARD_PX_HEIGHT,
        fontFamily: CARD_FONT,
      }}
    >
      {children}
    </div>
  );
}

/** Company logo on either side: the uploaded mark, or the name as a wordmark. */
function Logo({
  logoUrl,
  company,
  color,
  fontSize,
  className,
}: {
  logoUrl?: string | undefined;
  company: string;
  color: string;
  fontSize: number;
  className?: string | undefined;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn("max-h-full max-w-full object-contain", className)}
        crossOrigin="anonymous"
      />
    );
  }
  return (
    <span
      className={cn("block text-center font-extrabold uppercase leading-[1.05]", className)}
      style={{ color, fontSize }}
    >
      {company}
    </span>
  );
}

function CardFront({
  card,
  link,
  logoUrl,
  company,
  className,
}: {
  card: StaffCard;
  link: string;
  logoUrl?: string | undefined;
  company: string;
  className?: string | undefined;
}) {
  const phones = card.phone
    .split("/")
    .map((line) => line.trim())
    .filter(Boolean);
  const nameSize = cardNameFontSize(card.displayName);

  return (
    <CardBody className={className}>
      {/* Bottom-left ribbon: a green sliver at the edge, then the green bar with
          its gold pair underneath, exactly as on the reference. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: -74,
          top: 400,
          width: 118,
          height: 26,
          borderRadius: 13,
          backgroundColor: ID_CARD_GREEN,
          transform: "rotate(-35deg)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: -80,
          bottom: 32,
          width: 210,
          height: 34,
          borderRadius: 17,
          backgroundColor: ID_CARD_GREEN,
          transform: "rotate(-35deg)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: -62,
          bottom: -8,
          width: 150,
          height: 22,
          borderRadius: 11,
          backgroundColor: ID_CARD_GOLD,
          transform: "rotate(-35deg)",
        }}
      />

      {/* Photo in the company's frame. */}
      <div
        className="absolute overflow-hidden bg-neutral-100"
        style={{
          left: (CARD_PX_WIDTH - 130) / 2,
          top: 18,
          width: 130,
          height: 142,
          border: `2px solid ${ID_CARD_GREEN}`,
        }}
      >
        {card.photoUrl ? (
          <img
            src={card.photoUrl}
            alt={card.displayName}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[34px] font-semibold text-neutral-400">
            {staffInitials(card.displayName)}
          </span>
        )}
      </div>

      {/* Name and role: name in the company colour, role in black. A long name
          steps down in size rather than being cut off. */}
      <div className="absolute inset-x-0 px-2 text-center" style={{ top: 181 }}>
        <p
          className="truncate uppercase"
          style={{
            fontSize: nameSize,
            lineHeight: `${Math.round(nameSize * 1.16)}px`,
            fontWeight: 800,
            letterSpacing: "-0.3px",
            color: ID_CARD_GREEN,
          }}
        >
          {card.displayName}
        </p>
        <p
          className="truncate uppercase"
          style={{ marginTop: 7, fontSize: 13, lineHeight: "16px", fontWeight: 700 }}
        >
          {primaryRoleLabel(card.roles)}
        </p>
      </div>

      {/* ID, email and phone — labels bold, values regular, exactly as printed. */}
      <div className="absolute" style={{ left: 33, top: 244, width: 205 }}>
        <p style={{ fontSize: 11.5, lineHeight: "14px", fontWeight: 700 }}>{t("ID NO.")}</p>
        <p className="truncate" style={{ fontSize: 11.5, lineHeight: "15px" }}>
          {card.staffCode || "—"}
        </p>

        <p style={{ marginTop: 11, fontSize: 11.5, lineHeight: "14px", fontWeight: 700 }}>
          {t("EMAIL.")}
        </p>
        <p className="truncate" style={{ fontSize: 11.5, lineHeight: "15px" }}>
          {card.email || "—"}
        </p>

        <p style={{ marginTop: 11, fontSize: 11.5, lineHeight: "14px", fontWeight: 700 }}>
          {t("PHONE.")}
        </p>
        {(phones.length > 0 ? phones : ["—"]).map((line) => (
          <p key={line} style={{ fontSize: 11.5, lineHeight: "15px" }}>
            {line}
          </p>
        ))}

        {!card.active ? (
          <p
            style={{
              marginTop: 8,
              fontSize: 10,
              lineHeight: "12px",
              fontWeight: 700,
              color: "#b91c1c",
            }}
          >
            {t("No longer active")}
          </p>
        ) : null}
      </div>

      {/* Wordmark beside the ID block, as on the reference. */}
      <div
        className="absolute flex items-center justify-center overflow-hidden"
        style={{ left: 196, top: 248, width: 120, height: 46 }}
      >
        <Logo logoUrl={logoUrl} company={company} color={ID_CARD_GREEN} fontSize={13} />
      </div>

      {/* Front QR: bottom right, 150 px square, 18 px from the edge. */}
      <div className="absolute" style={{ left: 172, top: 350 }}>
        {link ? (
          <QrCode value={link} size={150} />
        ) : (
          <div aria-hidden style={{ width: 150, height: 150 }} className="bg-neutral-100" />
        )}
      </div>
    </CardBody>
  );
}

function CardBack({
  card,
  link,
  logoUrl,
  company,
  className,
}: {
  card: StaffCard;
  link: string;
  logoUrl?: string | undefined;
  company: string;
  className?: string | undefined;
}) {
  const address = card.branchAddress || card.companyAddress;
  const addressLines = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <CardBody className={className}>
      {/* Company header: green field with a curve sweeping down to the left, and
          the thin white swoosh that runs inside its lower edge on the right. */}
      <svg
        aria-hidden
        className="absolute left-0 top-0"
        width={CARD_PX_WIDTH}
        height={212}
        viewBox={`0 0 ${CARD_PX_WIDTH} 212`}
        preserveAspectRatio="none"
      >
        <path d="M0 0 H340 V107 C 262 110 128 156 0 210 Z" fill={ID_CARD_GREEN} />
        <path
          d="M340 90 C 300 94 258 110 226 128"
          fill="none"
          stroke="#ffffff"
          strokeWidth={6}
          strokeLinecap="round"
        />
      </svg>

      <div
        className="absolute flex items-center justify-center"
        style={{ left: 58, top: 38, width: 224, height: 80 }}
      >
        <Logo logoUrl={logoUrl} company={company} color="#ffffff" fontSize={24} />
      </div>

      {/* What to do if the card is found, then the office contacts. */}
      <div className="absolute" style={{ left: 38, right: 22, top: 187 }}>
        <p style={{ fontSize: 12.5, lineHeight: "19px", fontWeight: 700 }}>
          {t("If this card is found, please, Inform:")}
        </p>
        {addressLines.length > 0 ? (
          addressLines.map((line) => (
            <p key={line} style={{ fontSize: 12.5, lineHeight: "19px" }}>
              {line}
            </p>
          ))
        ) : (
          <p style={{ fontSize: 12.5, lineHeight: "19px" }}>—</p>
        )}

        <p style={{ marginTop: 9, fontSize: 12.5, lineHeight: "19px" }}>
          <span style={{ fontWeight: 700 }}>{t("Office:")}</span> {card.companyPhone || "—"}
        </p>
        <p style={{ fontSize: 12.5, lineHeight: "19px" }}>
          <span style={{ fontWeight: 700 }}>{t("Email:")}</span> {card.companyEmail || "—"}
        </p>
      </div>

      {/* Back QR: 184 px square, aligned with the text block. */}
      <div className="absolute" style={{ left: 42, top: 306 }}>
        {link ? (
          <QrCode value={link} size={184} />
        ) : (
          <div aria-hidden style={{ width: 184, height: 184 }} className="bg-neutral-100" />
        )}
      </div>

      {/* Bottom-right ribbon: gold over green, both leaving the card corner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: -66,
          bottom: 98,
          width: 205,
          height: 28,
          borderRadius: 14,
          backgroundColor: ID_CARD_GOLD,
          transform: "rotate(-35deg)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: -96,
          bottom: 26,
          width: 230,
          height: 34,
          borderRadius: 17,
          backgroundColor: ID_CARD_GREEN,
          transform: "rotate(-35deg)",
        }}
      />
    </CardBody>
  );
}
