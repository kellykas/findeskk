/**
 * Customer record validation.
 *
 * The same rules exist in the database (length checks, id_type vocabulary,
 * RLS); these checks only give staff fast, readable feedback before a request
 * is sent. Personal data never leaves the layer without validation.
 */
import { z } from "zod";

export const ID_TYPES = ["national_id", "passport", "driving_permit", "voter_card"] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<IdType | "", string> = {
  "": "Not recorded",
  national_id: "National ID",
  passport: "Passport",
  driving_permit: "Driving permit",
  voter_card: "Voter card",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name needs at least 2 characters")
    .max(80, "Name can have at most 80 characters"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone can have at most 20 characters")
    .regex(/^[0-9+() -]*$/, "Phone can only contain digits, spaces and + ( ) -"),
  email: z
    .string()
    .trim()
    .max(120, "Email can have at most 120 characters")
    .refine(
      (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email or leave it empty",
    ),
  idType: z.union([z.literal(""), z.enum(ID_TYPES)]),
  idNumber: z.string().trim().max(40, "Identification number can have at most 40 characters"),
  notes: z.string().trim().max(300, "Notes can have at most 300 characters"),
  branchId: z.string().refine((value) => value === "" || UUID.test(value), "Select a valid branch"),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerFormSchema = customerSchema.extend({
  active: z.boolean(),
});
export type CustomerFormInput = z.infer<typeof customerFormSchema>;
