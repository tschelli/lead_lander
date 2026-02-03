import type { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { ConfigSchema, type Config } from "@lead_lander/config-schema";
import { env } from "./env";

const cache = new Map<string, { expiresAt: number; value: Config }>();

const ttlMs = Number(env.configCacheTtlSeconds || 60) * 1000;

export type ConfigStore = {
  getClientConfig(clientId: string): Promise<Config>;
  getSchoolConfig(clientId: string, schoolId: string): Promise<Config>;
  invalidate(clientId: string): void;
  saveProgramLandingCopy(input: {
    clientId: string;
    schoolId: string;
    programId: string;
    landingCopy: Config["programs"][number]["landingCopy"];
    userId?: string;
    action: "draft" | "submit";
  }): Promise<void>;
  recordVersion(input: {
    clientId: string;
    schoolId: string;
    payload: Config;
    userId?: string;
  }): Promise<void>;
  applySchoolConfig(input: {
    clientId: string;
    schoolId: string;
    payload: Config;
    userId?: string;
  }): Promise<void>;
};

export function createConfigStore(pool: Pool): ConfigStore {
  return {
    async getClientConfig(clientId: string) {
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
          branding: row.branding
            ? {
                ...row.branding,
                logoUrl: row.branding.logoUrl ?? undefined
              }
            : row.branding,
          compliance: row.compliance,
          crmConnectionId: row.crm_connection_id,
          footerContent: row.footer_content || undefined,
          thankYou: row.thank_you || undefined
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
          leadForm: row.lead_form_config || undefined,
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

    async getSchoolConfig(clientId: string, schoolId: string) {
      const config = await this.getClientConfig(clientId);
      return {
        schools: config.schools.filter((item) => item.id === schoolId),
        campuses: config.campuses.filter((item) => item.schoolId === schoolId),
        programs: config.programs.filter((item) => item.schoolId === schoolId),
        landingPages: config.landingPages.filter((item) => item.schoolId === schoolId),
        crmConnections: config.crmConnections,
        quizQuestions: config.quizQuestions.filter((item) => !item.schoolId || item.schoolId === schoolId),
        quizAnswerOptions: config.quizAnswerOptions
      };
    },

    invalidate(clientId: string) {
      cache.delete(clientId);
    },

    async recordVersion({ clientId, schoolId, payload, userId }) {
      const versionResult = await pool.query(
        "SELECT COALESCE(MAX(version), 0) AS version FROM config_versions WHERE client_id = $1 AND school_id = $2",
        [clientId, schoolId]
      );
      const nextVersion = Number(versionResult.rows[0]?.version || 0) + 1;

      await pool.query(
        `INSERT INTO config_versions (id, client_id, school_id, version, payload, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)` ,
        [uuidv4(), clientId, schoolId, nextVersion, payload, new Date(), userId || null]
      );
    },

    async applySchoolConfig({ clientId, schoolId, payload, userId }) {
      ConfigSchema.parse(payload);
      const school = payload.schools.find((item) => item.id === schoolId);
      if (!school) {
        throw new Error("School not found in payload");
      }

      const programs = payload.programs.filter((item) => item.schoolId === schoolId);
      const campuses = payload.campuses.filter((item) => item.schoolId === schoolId);
      const landingPages = payload.landingPages.filter((item) => item.schoolId === schoolId);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE schools
           SET slug = $1, name = $2, branding = $3, compliance = $4, crm_connection_id = $5, thank_you = $6, updated_at = $7
           WHERE id = $8 AND client_id = $9`,
          [
            school.slug,
            school.name,
            school.branding,
            school.compliance,
            school.crmConnectionId,
            school.thankYou || null,
            new Date(),
            schoolId,
            clientId
          ]
        );

        await client.query("DELETE FROM programs WHERE school_id = $1 AND client_id = $2", [schoolId, clientId]);
        await client.query("DELETE FROM campuses WHERE school_id = $1 AND client_id = $2", [schoolId, clientId]);
        await client.query("DELETE FROM landing_pages WHERE school_id = $1 AND client_id = $2", [schoolId, clientId]);

        for (const program of programs) {
          await client.query(
          `INSERT INTO programs (id, client_id, school_id, slug, name, landing_copy, lead_form_config, question_overrides, available_campuses, template_type, hero_image, hero_background_color, hero_background_image, duration, salary_range, placement_rate, graduation_rate, highlights, testimonials, faqs, stats, sections_config, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $23)
           ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           school_id = EXCLUDED.school_id,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           landing_copy = EXCLUDED.landing_copy,
           lead_form_config = EXCLUDED.lead_form_config,
           question_overrides = EXCLUDED.question_overrides,
           available_campuses = EXCLUDED.available_campuses,
           template_type = EXCLUDED.template_type,
           hero_image = EXCLUDED.hero_image,
           hero_background_color = EXCLUDED.hero_background_color,
           hero_background_image = EXCLUDED.hero_background_image,
           duration = EXCLUDED.duration,
           salary_range = EXCLUDED.salary_range,
           placement_rate = EXCLUDED.placement_rate,
           graduation_rate = EXCLUDED.graduation_rate,
           highlights = EXCLUDED.highlights,
           testimonials = EXCLUDED.testimonials,
           faqs = EXCLUDED.faqs,
           stats = EXCLUDED.stats,
           sections_config = EXCLUDED.sections_config,
           updated_at = EXCLUDED.updated_at`,
            [
              program.id,
              clientId,
              schoolId,
              program.slug,
              program.name,
              program.landingCopy,
              program.leadForm || null,
              program.questionOverrides || null,
              program.availableCampuses || null,
              program.templateType || "full",
              program.heroImage || null,
              program.heroBackgroundColor || null,
              program.heroBackgroundImage || null,
              program.duration || null,
              program.salaryRange || null,
              program.placementRate || null,
              program.graduationRate || null,
              program.highlights || [],
              program.testimonials || [],
              program.faqs || [],
              program.stats || {},
              program.sectionsConfig || {
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
              new Date()
            ]
          );
        }

        for (const campus of campuses) {
          await client.query(
            `INSERT INTO campuses (id, client_id, school_id, slug, name, routing_tags, notifications, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
             ON CONFLICT (id) DO UPDATE SET
               client_id = EXCLUDED.client_id,
               school_id = EXCLUDED.school_id,
               slug = EXCLUDED.slug,
               name = EXCLUDED.name,
               routing_tags = EXCLUDED.routing_tags,
               notifications = EXCLUDED.notifications,
               updated_at = EXCLUDED.updated_at`,
            [
              campus.id,
              clientId,
              schoolId,
              campus.slug,
              campus.name,
              campus.routingTags || [],
              campus.notifications || null,
              new Date()
            ]
          );
        }

        for (const landing of landingPages) {
          await client.query(
            `INSERT INTO landing_pages (id, client_id, school_id, program_id, campus_id, overrides, notifications, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
             ON CONFLICT (id) DO UPDATE SET
               client_id = EXCLUDED.client_id,
               school_id = EXCLUDED.school_id,
               program_id = EXCLUDED.program_id,
               campus_id = EXCLUDED.campus_id,
               overrides = EXCLUDED.overrides,
               notifications = EXCLUDED.notifications,
               updated_at = EXCLUDED.updated_at`,
            [
              landing.id,
              clientId,
              schoolId,
              landing.programId,
              landing.campusId || null,
              landing.overrides || null,
              landing.notifications || null,
              new Date()
            ]
          );
        }

        await this.recordVersion({ clientId, schoolId, payload, userId });

        await client.query(
          `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), clientId, schoolId, "config_rollback", { schoolId }, new Date()]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      this.invalidate(clientId);
    },

    async saveProgramLandingCopy({ clientId, schoolId, programId, landingCopy, userId, action }) {
      const config = await this.getClientConfig(clientId);
      const program = config.programs.find((item) => item.id === programId);
      if (!program || program.schoolId !== schoolId) {
        throw new Error("Program not found");
      }

      const updatedPrograms = config.programs.map((item) =>
        item.id === programId ? { ...item, landingCopy } : item
      );

      const updatedConfig: Config = {
        ...config,
        programs: updatedPrograms
      };

      ConfigSchema.parse(updatedConfig);

      await pool.query(
        "UPDATE programs SET landing_copy = $1, updated_at = $2 WHERE id = $3 AND client_id = $4",
        [landingCopy, new Date(), programId, clientId]
      );

      await this.recordVersion({ clientId, schoolId, payload: updatedConfig, userId });

      await pool.query(
        `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)` ,
        [
          uuidv4(),
          clientId,
          schoolId,
          action === "submit" ? "config_submitted" : "config_draft_saved",
          { programId, landingCopy },
          new Date()
        ]
      );

      this.invalidate(clientId);
    }
  };
}
