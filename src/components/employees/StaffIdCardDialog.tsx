import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ImagePlus, Link2 } from "lucide-react";

import { StaffIdCard } from "@/components/employees/StaffIdCard";
import { FormError } from "@/components/shared/FormError";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ID_CARD_HEIGHT_MM,
  ID_CARD_WIDTH_MM,
  idCardLink,
  normalizeStaffCode,
  staffCardSchema,
  staffPhotoError,
  type StaffCard,
} from "@/domain/idCard";
import { t } from "@/domain/i18n";
import { useBranding } from "@/hooks/use-branding";
import { saveStaffCard, staffCardAdminQuery, uploadStaffPhoto } from "@/services/id-card.service";
import { settingsQuery } from "@/services/settings.service";
import { branchesQuery, type StaffMember } from "@/services/staff.service";

interface Props {
  staff: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** CSS pixels at 96 dpi, which is the unit the card component is laid out in. */
const CARD_WIDTH_PX = 340;
const MM_TO_PX = 96 / 25.4;
/** Scale that turns the 340 px card into exactly 85.6 mm on paper. */
const PRINT_SCALE = (ID_CARD_WIDTH_MM * MM_TO_PX) / CARD_WIDTH_PX;

/**
 * Issues one employee's ID card: photo, employee number, QR code and a
 * print-ready copy the administrator saves as PDF for the printing company.
 *
 * The photo and the number are saved together, because a card is only valid as
 * one document; the print dialog is the browser's own "Save as PDF", so no PDF
 * library is needed and the file is vector-crisp at card size.
 */
export function StaffIdCardDialog({ staff, open, onOpenChange }: Props) {
  const branding = useBranding();
  const queryClient = useQueryClient();
  const details = useQuery({ ...staffCardAdminQuery(staff.id), enabled: open });
  const settings = useQuery({ ...settingsQuery, enabled: open });
  const branches = useQuery({ ...branchesQuery, enabled: open });

  const [staffCode, setStaffCode] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!details.data) return;
    setStaffCode(details.data.staffCode);
    setPhotoPath(details.data.photoPath);
    setPhotoUrl(details.data.photoUrl);
  }, [details.data]);

  // Object URLs are only for the preview; they must not outlive the dialog.
  useEffect(() => {
    if (!pending) return;
    const url = pending.url;
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const token = details.data?.token ?? "";
  const link = token ? idCardLink(token) : "";
  const branchName =
    (branches.data ?? [])
      .filter((branch) => staff.branchIds.includes(branch.id))
      .map((branch) => branch.name)
      .join(", ") ||
    branches.data?.[0]?.name ||
    t("Main branch");

  const card: StaffCard = useMemo(
    () => ({
      displayName: staff.displayName,
      staffCode: normalizeStaffCode(staffCode) || "—",
      roles: staff.roles,
      branchName,
      active: staff.active,
      companyName: settings.data?.companyName ?? branding.appName,
      photoUrl: pending?.url ?? photoUrl,
      token,
    }),
    [
      staff,
      staffCode,
      branchName,
      settings.data?.companyName,
      branding.appName,
      pending,
      photoUrl,
      token,
    ],
  );

  const save = useMutation({
    mutationFn: async () => {
      const parsed = staffCardSchema.safeParse({ userId: staff.id, staffCode });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the employee ID.");
      }
      const path = pending ? await uploadStaffPhoto(staff.id, pending.file) : photoPath;
      await saveStaffCard({
        userId: staff.id,
        staffCode: parsed.data.staffCode,
        photoPath: path,
      });
      return parsed.data.staffCode;
    },
    onSuccess: (code) => {
      toast.success(`ID card saved for ${staff.displayName} (${code}).`);
      setPending(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["staff-card", staff.id] });
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;

    const invalid = staffPhotoError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPending({ file, url: URL.createObjectURL(file) });
  }

  async function downloadPdf() {
    // Wait for the logo and photo so the printed card is the finished one.
    try {
      await document.fonts?.ready;
    } catch {
      // Font loading is best-effort; printing must not be blocked by it.
    }
    window.print();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("Verification link copied."));
    } catch {
      toast.error(t("Could not copy the link. Copy it from the address bar instead."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Employee ID card")}</DialogTitle>
          <DialogDescription>
            {t(
              "Upload a photo and confirm the employee number. The QR code opens a verification page that shows only what is printed on this card.",
            )}
          </DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="card-photo">{t("Photo")}</Label>
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted">
                {card.photoUrl ? (
                  <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />
                )}
              </span>
              <label
                htmlFor="card-photo"
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                {card.photoUrl ? t("Replace photo") : t("Upload photo")}
              </label>
              <input
                id="card-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={choosePhoto}
                disabled={save.isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("JPG, PNG or WebP, up to 5 MB. A plain background and a square crop print best.")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-code">{t("Employee ID")}</Label>
            <Input
              id="card-code"
              value={staffCode}
              onChange={(event) => setStaffCode(event.target.value)}
              placeholder="FD-0001"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              disabled={details.isPending}
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              {t("Printed under the name and used by the QR verification page.")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("Card preview")}</Label>
          <div className="flex justify-center rounded-lg border bg-muted/40 p-4">
            <StaffIdCard
              card={card}
              link={link}
              logoUrl={branding.logoUrl}
              primary={branding.primary}
            />
          </div>
          <p className="break-all text-xs text-muted-foreground">
            {link ? `${t("Verification link")}: ${link}` : t("Loading the verification link…")}
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copyLink()}
            disabled={!link}
          >
            <Link2 className="h-4 w-4" />
            {t("Copy link")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void downloadPdf()}
            disabled={!link}
          >
            <Download className="h-4 w-4" />
            {t("Download PDF")}
          </Button>
          <Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("Saving…") : t("Save card")}
          </Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground">
          {t(
            "Download PDF opens the print dialog at card size (85.6 × 54 mm). Choose “Save as PDF” as the printer, then send that file to the printing company.",
          )}
        </p>
      </DialogContent>

      {/* Print-only copy: everything else in <body> is hidden while printing. */}
      {link &&
        createPortal(
          <div
            className="id-card-print-root overflow-hidden bg-white"
            style={{ width: `${ID_CARD_WIDTH_MM}mm`, height: `${ID_CARD_HEIGHT_MM}mm` }}
          >
            {/* @page cannot read a class or a variable, so the size is literal. */}
            <style>{`@page { size: ${ID_CARD_WIDTH_MM}mm ${ID_CARD_HEIGHT_MM}mm; margin: 0 }`}</style>
            <div style={{ transform: `scale(${PRINT_SCALE})`, transformOrigin: "top left" }}>
              <StaffIdCard
                card={card}
                link={link}
                logoUrl={branding.logoUrl}
                primary={branding.primary}
                className="rounded-none border-0"
              />
            </div>
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
