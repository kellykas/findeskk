/** Shared date helpers. The database rejects future entry dates using its own
 * (UTC) clock, so client validation uses the same reference to match. */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
