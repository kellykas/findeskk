/**
 * Desktop alerts for staff: a short chime and a system notification when a
 * customer request arrives while the tab is in the background.
 *
 * The chime is synthesised with the Web Audio API rather than shipped as an
 * audio file, so there is no asset to load and no autoplay-blocked download.
 * Browsers only allow audio after a user gesture, which is why the inbox's
 * alerts control plays the chime once when it is switched on.
 */

export const ALERT_SOUND_KEY = "findesk-service-alert-sound";

/** Minimal storage shape, so the preference is testable without a browser. */
export interface AlertStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Sound is on unless someone muted it; only background arrivals play it. */
export function readAlertSound(storage?: AlertStorage | null): boolean {
  try {
    return storage?.getItem(ALERT_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeAlertSound(on: boolean, storage?: AlertStorage | null): void {
  try {
    storage?.setItem(ALERT_SOUND_KEY, on ? "on" : "off");
  } catch {
    // Private mode or a blocked store: the choice lasts for this visit only.
  }
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** Two rising sine notes, quiet and under a quarter of a second. */
export function playAlertChime(): void {
  const ctx = audioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime;
  const notes: ReadonlyArray<readonly [number, number]> = [
    [880, 0],
    [1174.66, 0.14],
  ];

  for (const [frequency, offset] of notes) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + offset;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  }
}

export function desktopAlertsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopAlertPermission(): NotificationPermission | "unsupported" {
  if (!desktopAlertsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopAlerts(): Promise<NotificationPermission | "unsupported"> {
  if (!desktopAlertsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Shows a system notification. Clicking it brings the app window forward; the
 * browser lands on whatever page is already open, which is where the inbox is
 * when this fires.
 */
export function showDesktopNotification(title: string, body: string): void {
  if (!desktopAlertsSupported() || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "findesk-service-request",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Mobile browsers disallow the constructor; the in-app toast still fires.
  }
}
