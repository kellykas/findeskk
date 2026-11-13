/**
 * Customer service requests: the vocabulary and validation shared by the public
 * request page, the staff inbox and the chat thread.
 *
 * Pure logic only — no React and no I/O — so the rules can be tested without a
 * browser or a database. PostgreSQL enforces the same limits again; these
 * checks exist to answer without a round trip and to name the field at fault.
 */

/** What a customer can ask for. The codes are stored in the database. */
export const SERVICE_KINDS = [
  { code: "forex", label: "Foreign exchange", hint: "Buy or sell currency" },
  { code: "mobile_money", label: "Mobile money", hint: "MTN or Airtel deposits and withdrawals" },
  { code: "cash_transfer", label: "Cash transfer", hint: "Send or receive money" },
  { code: "account", label: "Account & documents", hint: "Statements, ID cards or KYC" },
  { code: "other", label: "Something else", hint: "Anything not listed here" },
] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number]["code"];

const SERVICE_CODES = SERVICE_KINDS.map((kind) => kind.code);

export function isServiceKind(value: string): value is ServiceKind {
  return (SERVICE_CODES as readonly string[]).includes(value);
}

/** Falls back to "Something else" rather than printing a raw database code. */
export function serviceLabel(value: string): string {
  return SERVICE_KINDS.find((kind) => kind.code === value)?.label ?? "Something else";
}

export const REQUEST_STATUSES = ["waiting", "answered", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  waiting: "Waiting for us",
  answered: "Answered",
  closed: "Closed",
};

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

export function isAwaitingStaff(status: string): boolean {
  return status === "waiting";
}

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 120;

const PHONE_PATTERN = /^[0-9+ ()-]{7,20}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface NewServiceRequestInput {
  customerName: string;
  phone: string;
  email: string;
  service: string;
  message: string;
}

/** Trims what a customer typed; the database stores the trimmed form too. */
export function normalizeNewRequest(input: NewServiceRequestInput): NewServiceRequestInput {
  return {
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    service: input.service.trim(),
    message: input.message.trim(),
  };
}

/** The first problem to fix, or null when the request can be sent. */
export function validateNewRequest(input: NewServiceRequestInput): string | null {
  const value = normalizeNewRequest(input);
  if (value.customerName.length < 2) return "Enter the name we should call you by.";
  if (value.customerName.length > MAX_NAME_LENGTH) return "Keep your name under 80 characters.";
  if (!PHONE_PATTERN.test(value.phone)) return "Enter a phone number we can reach you on.";
  if (value.email !== "") {
    if (value.email.length > MAX_EMAIL_LENGTH) return "Keep your email under 120 characters.";
    if (!EMAIL_PATTERN.test(value.email)) return "That email address does not look right.";
  }
  if (!isServiceKind(value.service)) return "Choose the service you need.";
  if (value.message.length < 5) return "Tell us what you need in a few words.";
  if (value.message.length > MAX_MESSAGE_LENGTH) return "Keep your message under 2000 characters.";
  return null;
}

/** A reply or follow-up message, which may not be empty. */
export function validateMessage(body: string): string | null {
  const value = body.trim();
  if (value.length === 0) return "Write a message first.";
  if (value.length > MAX_MESSAGE_LENGTH) return "Keep messages under 2000 characters.";
  return null;
}

/**
 * Handles arriving with an empty email field: the database stores '' rather
 * than NULL so every reader can treat it as a plain string.
 */
export function emailOrEmpty(value: string): string {
  return value.trim().toLowerCase();
}
