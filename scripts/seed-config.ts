import path from "path";
import { Pool } from "pg";
import { loadConfig } from "@lead_lander/config-schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
const configDir = process.env.CONFIG_DIR
  ? path.resolve(process.env.CONFIG_DIR)
  : path.resolve(process.cwd(), "configs");

const pool = new Pool({ connectionString: databaseUrl });

function toJson(value: unknown) {
  return value === undefined ? null : value;
}

async function seed() {
  const config = loadConfig(configDir);

  const clients = Array.from(
    new Set(config.schools.map((school) => school.clientId))
  ).map((id) => ({ id, name: id }));

  const clientById = new Map(clients.map((client) => [client.id, client]));

  const now = new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of clients) {
      await client.query(
        `INSERT INTO clients (id, name, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [item.id, item.name, now]
      );
    }

    for (const school of config.schools) {
      if (!clientById.has(school.clientId)) {
        throw new Error(`Missing client for school ${school.id}`);
      }
      await client.query(
        `INSERT INTO schools (id, client_id, slug, name, branding, compliance, crm_connection_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           branding = EXCLUDED.branding,
           compliance = EXCLUDED.compliance,
           crm_connection_id = EXCLUDED.crm_connection_id,
           updated_at = EXCLUDED.updated_at`,
        [
          school.id,
          school.clientId,
          school.slug,
          school.name,
          toJson(school.branding),
          toJson(school.compliance),
          school.crmConnectionId,
          now
        ]
      );
    }

    for (const connection of config.crmConnections) {
      await client.query(
        `INSERT INTO crm_connections (id, client_id, type, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           type = EXCLUDED.type,
           config = EXCLUDED.config,
           updated_at = EXCLUDED.updated_at`,
        [
          connection.id,
          (config.schools.find((school) => school.crmConnectionId === connection.id)?.clientId) ||
            config.schools[0]?.clientId,
          connection.type,
          toJson(connection.config || {}),
          now
        ]
      );
    }

    for (const program of config.programs) {
      const school = config.schools.find((item) => item.id === program.schoolId);
      if (!school) {
        throw new Error(`Missing school for program ${program.id}`);
      }
      await client.query(
        `INSERT INTO programs (id, client_id, school_id, slug, name, landing_copy, question_overrides, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           school_id = EXCLUDED.school_id,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           landing_copy = EXCLUDED.landing_copy,
           question_overrides = EXCLUDED.question_overrides,
           updated_at = EXCLUDED.updated_at`,
        [
          program.id,
          school.clientId,
          program.schoolId,
          program.slug,
          program.name,
          toJson(program.landingCopy),
          toJson(program.questionOverrides || null),
          now
        ]
      );
    }

    for (const campus of config.campuses) {
      const school = config.schools.find((item) => item.id === campus.schoolId);
      if (!school) {
        throw new Error(`Missing school for campus ${campus.id}`);
      }
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
          school.clientId,
          campus.schoolId,
          campus.slug,
          campus.name,
          toJson(campus.routingTags || []),
          toJson(campus.notifications || null),
          now
        ]
      );
    }

    for (const landing of config.landingPages) {
      const school = config.schools.find((item) => item.id === landing.schoolId);
      if (!school) {
        throw new Error(`Missing school for landing page ${landing.id}`);
      }
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
          school.clientId,
          landing.schoolId,
          landing.programId,
          landing.campusId || null,
          toJson(landing.overrides || null),
          toJson(landing.notifications || null),
          now
        ]
      );
    }

    await client.query("COMMIT");
    console.log("Config seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
