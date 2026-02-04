import { z } from "zod";

// ============================================================================
// COLOR & BRANDING SCHEMAS
// ============================================================================

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

export const FooterContentSchema = z.object({
  socialLinks: z
    .object({
      facebook: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      instagram: z.string().optional()
    })
    .optional(),
  customLinks: z
    .array(
      z.object({
        label: z.string(),
        url: z.string()
      })
    )
    .optional()
});

export const ThankYouSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  body: z.string().optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional()
});

// ============================================================================
// CLIENT SCHEMA
// ============================================================================

export const ClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

// ============================================================================
// ACCOUNT SCHEMA (formerly School)
// ============================================================================

export const AccountSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  branding: BrandingSchema,
  compliance: ComplianceSchema,
  crmConnectionId: z.string().min(1).optional(),
  footerContent: FooterContentSchema.optional(),
  thankYou: ThankYouSchema.optional(),
  isActive: z.boolean().default(true)
});

// ============================================================================
// LOCATION SCHEMA (formerly Campus)
// ============================================================================

export const LocationSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  accountId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  routingTags: z.array(z.string()).default([]),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      recipients: z.array(z.string()).default([])
    })
    .optional(),
  isActive: z.boolean().default(true)
});

// ============================================================================
// PROGRAM SCHEMAS
// ============================================================================

export const LandingCopySchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().min(1),
  body: z.string().min(1),
  ctaText: z.string().default("Get Started")
});

export const ProgramHighlightSchema = z.object({
  icon: z.string().optional(),
  text: z.string().min(1)
});

export const ProgramTestimonialSchema = z.object({
  quote: z.string().min(1),
  author: z.string().min(1),
  role: z.string().optional(),
  photo: z.string().optional()
});

export const ProgramFAQSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1)
});

export const ProgramStatsSchema = z.object({
  placementRate: z.string().optional(),
  avgSalary: z.string().optional(),
  duration: z.string().optional(),
  graduationRate: z.string().optional()
});

export const SectionsConfigSchema = z.object({
  order: z.array(z.string()).default([
    "hero",
    "highlights",
    "stats",
    "testimonials",
    "form",
    "faqs"
  ]),
  visible: z.record(z.boolean()).default({
    hero: true,
    highlights: true,
    stats: true,
    testimonials: true,
    form: true,
    faqs: true
  })
});

export const LeadFormFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "email", "tel", "select", "radio", "checkbox", "textarea", "number", "zip"]),
  required: z.boolean().default(false),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string()
      })
    )
    .optional(),
  mapTo: z.enum(["answers", "location_id"]).default("answers"),
  placeholder: z.string().optional()
});

export const LeadFormConfigSchema = z.object({
  fields: z.array(LeadFormFieldSchema).default([]),
  consentLabel: z.string().optional()
});

export const ProgramSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  accountId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  landingCopy: LandingCopySchema.optional(),
  leadForm: LeadFormConfigSchema.optional(),
  heroImage: z.string().optional(),
  heroBackgroundColor: z.string().optional(),
  heroBackgroundImage: z.string().optional(),
  highlights: z.array(ProgramHighlightSchema).default([]),
  testimonials: z.array(ProgramTestimonialSchema).default([]),
  faqs: z.array(ProgramFAQSchema).default([]),
  stats: ProgramStatsSchema.default({}),
  sectionsConfig: SectionsConfigSchema.default({
    order: ["hero", "highlights", "stats", "testimonials", "form", "faqs"],
    visible: {
      hero: true,
      highlights: true,
      stats: true,
      testimonials: true,
      form: true,
      faqs: true
    }
  }),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

// ============================================================================
// CRM CONNECTION SCHEMA
// ============================================================================

export const CrmConnectionSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  type: z.enum(["webhook", "generic"]),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().default(true)
});

// ============================================================================
// QUIZ SCHEMAS
// ============================================================================

export const QuizQuestionSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  accountId: z.string().optional(),
  questionText: z.string().min(1),
  questionType: z.enum(["single_choice", "multiple_choice", "text"]).default("single_choice"),
  helpText: z.string().optional(),
  displayOrder: z.number().int().default(0),
  conditionalOn: z
    .object({
      questionId: z.string(),
      optionIds: z.array(z.string())
    })
    .optional(),
  isActive: z.boolean().default(true)
});

export const QuizAnswerOptionSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  questionId: z.string().min(1),
  optionText: z.string().min(1),
  displayOrder: z.number().int().default(0),
  pointAssignments: z.record(z.number()).default({}) // Maps program IDs to point values
});

// ============================================================================
// LANDING PAGE QUESTION SCHEMAS
// ============================================================================

export const LandingPageQuestionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  questionText: z.string().min(1),
  questionType: z.enum(["text", "textarea", "select", "radio", "checkbox", "number", "tel", "email", "zip"]),
  helpText: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isRequired: z.boolean().default(false),
  crmFieldName: z.string().optional(),
  isActive: z.boolean().default(true)
});

export const LandingPageQuestionOptionSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
  optionText: z.string().min(1),
  optionValue: z.string().min(1),
  displayOrder: z.number().int().default(0)
});

// ============================================================================
// WEBHOOK SCHEMA
// ============================================================================

export const WebhookConfigSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  webhookUrl: z.string().url(),
  events: z.array(z.enum(["submission_created", "quiz_started", "quiz_completed", "submission_updated"])).default([
    "submission_created",
    "quiz_completed"
  ]),
  headers: z.record(z.string()).default({}),
  isActive: z.boolean().default(true)
});

// ============================================================================
// ROOT CONFIG SCHEMA
// ============================================================================

export const ConfigSchema = z.object({
  clients: z.array(ClientSchema).default([]),
  accounts: z.array(AccountSchema).default([]),
  locations: z.array(LocationSchema).default([]),
  programs: z.array(ProgramSchema).default([]),
  crmConnections: z.array(CrmConnectionSchema).default([]),
  quizQuestions: z.array(QuizQuestionSchema).default([]),
  quizAnswerOptions: z.array(QuizAnswerOptionSchema).default([]),
  landingPageQuestions: z.array(LandingPageQuestionSchema).default([]),
  landingPageQuestionOptions: z.array(LandingPageQuestionOptionSchema).default([]),
  webhookConfigs: z.array(WebhookConfigSchema).default([])
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Config = z.infer<typeof ConfigSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type CrmConnection = z.infer<typeof CrmConnectionSchema>;

// Program content types
export type LandingCopy = z.infer<typeof LandingCopySchema>;
export type ProgramHighlight = z.infer<typeof ProgramHighlightSchema>;
export type ProgramTestimonial = z.infer<typeof ProgramTestimonialSchema>;
export type ProgramFAQ = z.infer<typeof ProgramFAQSchema>;
export type ProgramStats = z.infer<typeof ProgramStatsSchema>;
export type SectionsConfig = z.infer<typeof SectionsConfigSchema>;
export type LeadFormField = z.infer<typeof LeadFormFieldSchema>;
export type LeadFormConfig = z.infer<typeof LeadFormConfigSchema>;

// Quiz types
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizAnswerOption = z.infer<typeof QuizAnswerOptionSchema>;

// Landing page question types
export type LandingPageQuestion = z.infer<typeof LandingPageQuestionSchema>;
export type LandingPageQuestionOption = z.infer<typeof LandingPageQuestionOptionSchema>;

// Webhook types
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

// Branding types
export type Color = z.infer<typeof ColorSchema>;
export type Branding = z.infer<typeof BrandingSchema>;
export type Compliance = z.infer<typeof ComplianceSchema>;
export type FooterContent = z.infer<typeof FooterContentSchema>;
export type ThankYou = z.infer<typeof ThankYouSchema>;

// ============================================================================
// LEGACY TYPE ALIASES (for backwards compatibility during refactor)
// ============================================================================
// These can be removed once all code is updated

/** @deprecated Use Account instead */
export type School = Account;
/** @deprecated Use AccountSchema instead */
export const SchoolSchema = AccountSchema;

/** @deprecated Use Location instead */
export type Campus = Location;
/** @deprecated Use LocationSchema instead */
export const CampusSchema = LocationSchema;
