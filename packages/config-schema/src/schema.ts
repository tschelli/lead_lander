import { z } from "zod";

export const ColorSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional()
});

const LogoUrlSchema = z
  .string()
  .refine((value) => {
    if (value.startsWith("/")) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "logoUrl must be an absolute URL or a public path starting with '/'");

export const BrandingSchema = z.object({
  logoUrl: LogoUrlSchema.optional(),
  colors: ColorSchema
});

export const ComplianceSchema = z.object({
  disclaimerText: z.string().min(1),
  version: z.string().min(1)
});

export const SchoolSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  branding: BrandingSchema,
  compliance: ComplianceSchema,
  crmConnectionId: z.string().min(1)
});

export const CampusSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  routingTags: z.array(z.string()).default([]),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      recipients: z.array(z.string()).default([])
    })
    .optional()
});

export const LandingCopySchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().min(1),
  body: z.string().min(1),
  ctaText: z.string().default("Get Program Info")
});

export const QuestionOverrideSchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean().optional(),
  label: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string()
      })
    )
    .optional(),
  required: z.boolean().optional(),
  showIf: z
    .object({
      questionId: z.string(),
      equals: z.union([z.string(), z.array(z.string())])
    })
    .optional()
});

export const ProgramSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  landingCopy: LandingCopySchema,
  questionOverrides: z.array(QuestionOverrideSchema).optional()
});

export const LandingPageSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  campusId: z.string().min(1),
  programId: z.string().min(1),
  overrides: z
    .object({
      landingCopy: LandingCopySchema.optional(),
      questionOverrides: z.array(QuestionOverrideSchema).optional()
    })
    .optional(),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      recipients: z.array(z.string()).default([])
    })
    .optional()
});

export const CrmConnectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["webhook", "generic"]),
  config: z.record(z.any()).optional()
});

export const ConfigSchema = z.object({
  schools: z.array(SchoolSchema),
  campuses: z.array(CampusSchema),
  programs: z.array(ProgramSchema),
  landingPages: z.array(LandingPageSchema),
  crmConnections: z.array(CrmConnectionSchema)
});

export type Config = z.infer<typeof ConfigSchema>;
export type School = z.infer<typeof SchoolSchema>;
export type Campus = z.infer<typeof CampusSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type LandingPage = z.infer<typeof LandingPageSchema>;
export type CrmConnection = z.infer<typeof CrmConnectionSchema>;
