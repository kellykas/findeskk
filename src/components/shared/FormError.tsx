import { useEffect, useRef } from "react";

/**
 * Form-level error banner for dialogs.
 *
 * It scrolls itself into view and is announced to assistive technology, because
 * pressing a button at the bottom of a long form and seeing no visible change
 * reads as "nothing happened" — especially for someone new to the application.
 */
export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [message]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
