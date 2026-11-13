import { describe, expect, it } from "vitest";

import { ALERT_SOUND_KEY, readAlertSound, storeAlertSound } from "./desktop-alerts";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe("desktop alerts", () => {
  it("plays sound until someone mutes it", () => {
    expect(readAlertSound(memoryStorage())).toBe(true);
    expect(readAlertSound(memoryStorage({ [ALERT_SOUND_KEY]: "on" }))).toBe(true);
    expect(readAlertSound(memoryStorage({ [ALERT_SOUND_KEY]: "off" }))).toBe(false);
  });

  it("remembers the mute choice", () => {
    const storage = memoryStorage();
    storeAlertSound(false, storage);
    expect(storage.values.get(ALERT_SOUND_KEY)).toBe("off");
    storeAlertSound(true, storage);
    expect(readAlertSound(storage)).toBe(true);
  });

  it("stays loud when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readAlertSound(broken)).toBe(true);
    expect(() => storeAlertSound(false, broken)).not.toThrow();
  });
});
