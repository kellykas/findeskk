/**
 * Cross-platform `clsx` with the Tailwind `tw-merge` merge behavior.
 *
 * @see https://github.com/tailwindlabs/tailwind-merge
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
