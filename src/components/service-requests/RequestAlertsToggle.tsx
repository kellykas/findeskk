import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import {
  desktopAlertPermission,
  desktopAlertsSupported,
  playAlertChime,
  readAlertSound,
  requestDesktopAlerts,
  storeAlertSound,
} from "@/lib/desktop-alerts";

/**
 * Controls for the background alerts: the chime, and the browser's permission
 * for system notifications. Both are read after mount so the server-rendered
 * markup and the first client render agree.
 */
export function RequestAlertsToggle() {
  const { t } = useLanguage();
  const [sound, setSound] = useState(true);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setSound(readAlertSound(window.localStorage));
    setSupported(desktopAlertsSupported());
    setPermission(desktopAlertPermission());
  }, []);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    storeAlertSound(next, window.localStorage);
    // Playing it here doubles as the gesture that unlocks audio for later alerts.
    if (next) playAlertChime();
  }

  async function enableDesktop() {
    const result = await requestDesktopAlerts();
    setPermission(result);
    if (result === "granted") {
      playAlertChime();
      toast.success(t("Desktop alerts are on."));
    } else if (result === "denied") {
      toast.error(t("Desktop alerts are blocked in this browser. Sound still works."));
    } else if (result === "unsupported") {
      toast.error(t("This browser cannot show desktop alerts."));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={toggleSound}
        aria-pressed={sound}
        title={t("Play a chime when a request arrives while this tab is in the background.")}
      >
        {sound ? (
          <Volume2 className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <VolumeX className="mr-1.5 h-3.5 w-3.5" />
        )}
        {sound ? t("Sound on") : t("Sound off")}
      </Button>

      {supported && permission !== "granted" && (
        <Button variant="outline" size="sm" onClick={() => void enableDesktop()}>
          <BellOff className="mr-1.5 h-3.5 w-3.5" />
          {t("Enable desktop alerts")}
        </Button>
      )}

      {supported && permission === "granted" && (
        <span className="flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Bell className="h-3.5 w-3.5 text-primary" />
          {t("Desktop alerts on")}
        </span>
      )}
    </>
  );
}
