import type { Pool } from "pg";
import { ConfigSchema, type Config } from "@lead_lander/config-schema";
import { env } from "./env";

const cache = new Map<string, { expiresAt: number; value: Config }>();
const ttlMs = Number(env.configCacheTtlSeconds || 60) * 1000;

export function createConfigStore(pool: Pool) {
  return {
    async getClientConfig(clientId: string): Promise<Config> {
      const cached = cache.get(clientId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      const [schools, campuses, programs, landingPages, crmConnections, quizQuestions, quizAnswerOptions] = await Promise.all([
        pool.query("SELECT * FROM schools WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM campuses WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM programs WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM landing_pages WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM crm_connections WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM quiz_questions WHERE client_id = $1 ORDER BY display_order", [clientId]),
        pool.query("SELECT * FROM quiz_answer_options WHERE client_id = $1 ORDER BY display_order", [clientId])
      ]);

      const config: Config = {
        schools: schools.rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          slug: row.slug,
          name: row.name,
          branding: row.branding,
          compliance: row.compliance,
          crmConnectionId: row.crm_connection_id,
          footerContent: row.footer_content || undefined
        })),
        campuses: campuses.rows.map((row) => ({
          id: row.id,
          schoolId: row.school_id,
          slug: row.slug,
          name: row.name,
          routingTags: row.routing_tags || [],
          notifications: row.notifications || undefined
        })),
        programs: programs.rows.map((row) => ({
          id: row.id,
          schoolId: row.school_id,
          slug: row.slug,
          name: row.name,
          landingCopy: row.landing_copy,
          questionOverrides: row.question_overrides || undefined,
          availableCampuses: row.available_campuses || undefined,
          templateType: row.template_type || "full",
          heroImage: row.hero_image || undefined,
          heroBackgroundColor: row.hero_background_color || undefined,
          heroBackgroundImage: row.hero_background_image || undefined,
          duration: row.duration || undefined,
          salaryRange: row.salary_range || undefined,
          placementRate: row.placement_rate || undefined,
          graduationRate: row.graduation_rate || undefined,
          highlights: row.highlights || [],
          testimonials: row.testimonials || [],
          faqs: row.faqs || [],
          stats: row.stats || {},
          sectionsConfig: row.sections_config || {
            order: ["hero", "highlights", "stats", "testimonials", "form", "faqs"],
            visible: {
              hero: true,
              highlights: true,
              stats: true,
              testimonials: true,
              form: true,
              faqs: true
            }
          },
          useQuizRouting: row.use_quiz_routing || false
        })),
        landingPages: landingPages.rows.map((row) => ({
          id: row.id,
          schoolId: row.school_id,
          programId: row.program_id,
          campusId: row.campus_id || undefined,
          overrides: row.overrides || undefined,
          notifications: row.notifications || undefined
        })),
        crmConnections: crmConnections.rows.map((row) => ({
          id: row.id,
          type: row.type,
          config: row.config || undefined
        })),
        quizQuestions: quizQuestions.rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          schoolId: row.school_id || undefined,
          questionText: row.question_text,
          questionType: row.question_type,
          helpText: row.help_text || undefined,
          displayOrder: row.display_order,
          conditionalOn: row.conditional_on || undefined,
          isActive: row.is_active
        })),
        quizAnswerOptions: quizAnswerOptions.rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          questionId: row.question_id,
          optionText: row.option_text,
          displayOrder: row.display_order,
          pointAssignments: row.point_assignments || {}
        }))
      };

      const parsed = ConfigSchema.parse(config);
      cache.set(clientId, { value: parsed, expiresAt: Date.now() + ttlMs });
      return parsed;
    },
    invalidate(clientId: string) {
      cache.delete(clientId);
    }
  };
}
