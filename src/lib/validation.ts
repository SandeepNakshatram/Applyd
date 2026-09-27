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

export const manualApplicationSchema = z.object({
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  appliedAt: z.string().date().optional().nullable(),
  source: z.enum(applicationSourceValues),
  status: z.enum(applicationStatusValues),
  nextAction: z.string().trim().max(200).optional().nullable(),
  nextActionDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
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
  reviewAction: z.enum(["confirm", "ignore"]).optional(),
});

export type ManualApplicationInput = z.infer<typeof manualApplicationSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;
