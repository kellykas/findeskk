/**
 * Service request data access.
 *
 * The two tables are closed to every client role, so nothing here reads them
 * directly. Anonymous visitors go through functions bound to an unguessable
 * token; staff go through functions that check the signed-in role. A customer's
 * phone number therefore never reaches anyone holding neither the token nor a
 * staff role.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  isRequestStatus,
  isServiceKind,
  type NewServiceRequestInput,
  type RequestStatus,
  type ServiceKind,
} from "@/domain/serviceRequests";

/**
 * The generated Database types predate these tables and functions, so the RPC
 * surface is typed here rather than by editing generated code.
 */
interface RpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function rpcClient(): RpcClient {
  // Member call on purpose: supabase-js reads `this` inside rpc().
  return supabase as unknown as RpcClient;
}

export interface ChatMessage {
  id: string;
  authorKind: "customer" | "staff";
  authorName: string;
  body: string;
  createdAt: string;
}

/** One conversation. Contact details are present only for staff readers. */
export interface RequestThread {
  id: string;
  ticketNo: string;
  customerName: string;
  phone: string;
  email: string;
  service: ServiceKind;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** A row in the staff inbox, without the whole conversation. */
export interface RequestSummary {
  id: string;
  ticketNo: string;
  customerName: string;
  phone: string;
  email: string;
  service: ServiceKind;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  lastBody: string;
  lastAuthorKind: "customer" | "staff";
  messageCount: number;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (typeof value === "number" ? value : 0);
type Row = Record<string, unknown>;

function messageFromRow(row: Row): ChatMessage {
  return {
    id: str(row["id"]),
    authorKind: row["authorKind"] === "staff" ? "staff" : "customer",
    authorName: str(row["authorName"]),
    body: str(row["body"]),
    createdAt: str(row["createdAt"]),
  };
}

function threadFromPayload(payload: unknown): RequestThread | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Row;
  const service = str(row["service"]);
  const status = str(row["status"]);
  const messages = Array.isArray(row["messages"]) ? (row["messages"] as Row[]) : [];
  return {
    id: str(row["id"]),
    ticketNo: str(row["ticketNo"]),
    customerName: str(row["customerName"]),
    phone: str(row["phone"]),
    email: str(row["email"]),
    service: isServiceKind(service) ? service : "other",
    status: isRequestStatus(status) ? status : "waiting",
    createdAt: str(row["createdAt"]),
    updatedAt: str(row["updatedAt"]),
    messages: messages.map(messageFromRow),
  };
}

/**
 * Database messages are written in plain language for the customer, so they are
 * shown as-is; these few are the exceptions worth rephrasing for staff screens.
 */
export function requestErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("only staff") || text.includes("permission denied"))
    return "Only staff can open or answer customer requests.";
  if (text.includes("jwt") || text.includes("not authenticated"))
    return "Your session expired. Sign in again.";
  return message;
}

/** Public: create a request and its first message. Returns the private link key. */
export async function createServiceRequest(
  input: NewServiceRequestInput,
): Promise<{ token: string; ticketNo: string }> {
  const { data, error } = await rpcClient().rpc("create_service_request", {
    _name: input.customerName,
    _phone: input.phone,
    _email: input.email,
    _service: input.service,
    _message: input.message,
  });
  if (error) throw new Error(requestErrorMessage(error.message));
  const row = (data ?? {}) as Row;
  return { token: str(row["token"]), ticketNo: str(row["ticketNo"]) };
}

/** Public: read a thread with nothing but its token. */
export async function getServiceRequest(token: string): Promise<RequestThread | null> {
  const { data, error } = await rpcClient().rpc("get_service_request", { _token: token });
  if (error) throw new Error(requestErrorMessage(error.message));
  return threadFromPayload(data);
}

/** Public: a follow-up message from the customer. */
export async function sendCustomerMessage(token: string, body: string): Promise<void> {
  const { error } = await rpcClient().rpc("add_service_request_message", {
    _token: token,
    _message: body,
  });
  if (error) throw new Error(requestErrorMessage(error.message));
}

export async function listServiceRequests(): Promise<RequestSummary[]> {
  const { data, error } = await rpcClient().rpc("staff_service_requests");
  if (error) throw new Error(requestErrorMessage(error.message));
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  return rows.map((row) => {
    const service = str(row["service"]);
    const status = str(row["status"]);
    return {
      id: str(row["id"]),
      ticketNo: str(row["ticketNo"]),
      customerName: str(row["customerName"]),
      phone: str(row["phone"]),
      email: str(row["email"]),
      service: isServiceKind(service) ? service : "other",
      status: isRequestStatus(status) ? status : "waiting",
      createdAt: str(row["createdAt"]),
      updatedAt: str(row["updatedAt"]),
      lastBody: str(row["lastBody"]),
      lastAuthorKind: row["lastAuthorKind"] === "staff" ? "staff" : "customer",
      messageCount: count(row["messageCount"]),
    } satisfies RequestSummary;
  });
}

export async function getServiceRequestForStaff(id: string): Promise<RequestThread | null> {
  const { data, error } = await rpcClient().rpc("staff_service_request", { _id: id });
  if (error) throw new Error(requestErrorMessage(error.message));
  return threadFromPayload(data);
}

export async function replyToServiceRequest(id: string, body: string): Promise<void> {
  const { error } = await rpcClient().rpc("staff_reply_service_request", {
    _id: id,
    _message: body,
  });
  if (error) throw new Error(requestErrorMessage(error.message));
}

export async function setServiceRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const { error } = await rpcClient().rpc("set_service_request_status", {
    _id: id,
    _status: status,
  });
  if (error) throw new Error(requestErrorMessage(error.message));
}

/** Shared by the inbox and the notification watcher, so one poll serves both. */
export const staffRequestsQuery = queryOptions({
  queryKey: ["service-requests", "staff"],
  queryFn: listServiceRequests,
  staleTime: 5_000,
});

export function staffRequestQuery(id: string) {
  return queryOptions({
    queryKey: ["service-requests", "staff", id],
    queryFn: () => getServiceRequestForStaff(id),
    enabled: id !== "",
    staleTime: 2_000,
  });
}

export function publicRequestQuery(token: string) {
  return queryOptions({
    queryKey: ["service-requests", "public", token],
    queryFn: () => getServiceRequest(token),
    enabled: token !== "",
    staleTime: 2_000,
  });
}
