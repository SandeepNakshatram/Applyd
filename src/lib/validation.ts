import { z } from "zod";

export const applicationStatusValues = [
  "APPLIED",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const applicationSourceValues = [
  "LINKEDIN",
  "NAUKRI",
  "REFERRAL",
  "COMPANY_WEBSITE",
  "OTHER",
] as const;

/** Only http(s) links — a stored "javascript:" URL rendered as a link would be an XSS vector. */
const jobUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link")
  .optional()
  .nullable();

export const manualApplicationSchema = z.object({
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  appliedAt: z.string().date().optional().nullable(),
  source: z.enum(applicationSourceValues),
  status: z.enum(applicationStatusValues),
  nextAction: z.string().trim().max(200).optional().nullable(),
  nextActionDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  jobUrl: jobUrlSchema,
});

export const applicationUpdateSchema = z.object({
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(200).optional(),
  appliedAt: z.string().date().optional().nullable(),
  source: z.enum(applicationSourceValues).optional(),
  status: z.enum(applicationStatusValues).optional(),
  nextAction: z.string().trim().max(200).optional().nullable(),
  nextActionDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  jobUrl: jobUrlSchema,
  reviewAction: z.enum(["confirm", "ignore"]).optional(),
});

export type ManualApplicationInput = z.infer<typeof manualApplicationSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;
