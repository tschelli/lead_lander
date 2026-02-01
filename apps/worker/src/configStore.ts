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

      const [schools, campuses, programs, landingPages, crmConnections] = await Promise.all([
        pool.query("SELECT * FROM schools WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM campuses WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM programs WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM landing_pages WHERE client_id = $1", [clientId]),
        pool.query("SELECT * FROM crm_connections WHERE client_id = $1", [clientId])
      ]);

      const config: Config = {
        schools: schools.rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          slug: row.slug,
          name: row.name,
          branding: row.branding,
          compliance: row.compliance,
          crmConnectionId: row.crm_connection_id
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
          questionOverrides: row.question_overrides || undefined
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
