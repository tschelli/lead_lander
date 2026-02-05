import { Pool } from "pg";
import * as bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";

async function seed() {
  const pool = new Pool({ connectionString: databaseUrl });

  console.log("🌱 Seeding database...\n");

  try {
    // ========================================================================
    // 1. CLIENT
    // ========================================================================
    console.log("Creating client...");
    await pool.query(`
      INSERT INTO clients (id, name) VALUES ('demo-client', 'Demo Organization')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `);

    // ========================================================================
    // 2. ACCOUNTS (formerly schools)
    // ========================================================================
    console.log("Creating accounts...");

    await pool.query(`
      INSERT INTO accounts (id, client_id, slug, name, branding, compliance, is_active) VALUES
      ('tech-institute', 'demo-client', 'tech-institute', 'Tech Institute',
        '{"colors": {"primary": "#0066cc", "secondary": "#00aaff"}, "logoUrl": "/logos/tech-institute.png"}',
        '{"disclaimerText": "By submitting this form, you consent to be contacted by Tech Institute.", "version": "1.0"}',
        true
      ),
      ('health-academy', 'demo-client', 'health-academy', 'Health Academy',
        '{"colors": {"primary": "#00cc66", "secondary": "#00ff99"}, "logoUrl": "/logos/health-academy.png"}',
        '{"disclaimerText": "By submitting this form, you consent to be contacted by Health Academy.", "version": "1.0"}',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        branding = EXCLUDED.branding,
        compliance = EXCLUDED.compliance
    `);

    // ========================================================================
    // 3. LOCATIONS (formerly campuses)
    // ========================================================================
    console.log("Creating locations...");

    await pool.query(`
      INSERT INTO locations (id, client_id, account_id, slug, name, address, city, state, zip_code, latitude, longitude, routing_tags, is_active) VALUES
      -- Tech Institute Locations
      ('tech-seattle', 'demo-client', 'tech-institute', 'seattle', 'Seattle Campus', '123 Tech St', 'Seattle', 'WA', '98101', 47.6062, -122.3321, '["washington", "northwest"]', true),
      ('tech-portland', 'demo-client', 'tech-institute', 'portland', 'Portland Campus', '456 Innovation Ave', 'Portland', 'OR', '97201', 45.5152, -122.6784, '["oregon", "northwest"]', true),
      ('tech-sf', 'demo-client', 'tech-institute', 'san-francisco', 'San Francisco Campus', '789 Market St', 'San Francisco', 'CA', '94102', 37.7749, -122.4194, '["california", "west-coast"]', true),

      -- Health Academy Locations
      ('health-boston', 'demo-client', 'health-academy', 'boston', 'Boston Campus', '321 Medical Dr', 'Boston', 'MA', '02101', 42.3601, -71.0589, '["massachusetts", "northeast"]', true),
      ('health-chicago', 'demo-client', 'health-academy', 'chicago', 'Chicago Campus', '654 Healthcare Blvd', 'Chicago', 'IL', '60601', 41.8781, -87.6298, '["illinois", "midwest"]', true),
      ('health-miami', 'demo-client', 'health-academy', 'miami', 'Miami Campus', '987 Wellness Way', 'Miami', 'FL', '33101', 25.7617, -80.1918, '["florida", "southeast"]', true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip_code = EXCLUDED.zip_code
    `);

    // ========================================================================
    // 4. CRM CONNECTIONS
    // ========================================================================
    console.log("Creating CRM connections...");

    await pool.query(`
      INSERT INTO crm_connections (id, client_id, type, config, is_active) VALUES
      ('webhook-crm', 'demo-client', 'webhook', '{"endpoint": "http://webhook-mock:1080/webhook/crm", "authHeaderName": "Authorization", "authHeaderValue": "Bearer local-dev-token"}', true)
      ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config
    `);

    await pool.query(`
      UPDATE accounts SET crm_connection_id = 'webhook-crm' WHERE client_id = 'demo-client'
    `);

    // ========================================================================
    // 5. PROGRAMS
    // ========================================================================
    console.log("Creating programs...");

    await pool.query(`
      INSERT INTO programs (id, client_id, account_id, slug, name, description, display_order, is_active) VALUES
      -- Tech Institute Programs
      ('prog-software-dev', 'demo-client', 'tech-institute', 'software-development', 'Software Development',
        'Learn full-stack development with modern technologies', 1, true),
      ('prog-data-science', 'demo-client', 'tech-institute', 'data-science', 'Data Science & Analytics',
        'Master data analysis, machine learning, and AI', 2, true),
      ('prog-cybersecurity', 'demo-client', 'tech-institute', 'cybersecurity', 'Cybersecurity',
        'Protect systems and networks from digital attacks', 3, true),
      ('prog-cloud-computing', 'demo-client', 'tech-institute', 'cloud-computing', 'Cloud Computing',
        'Build and manage cloud infrastructure', 4, true),

      -- Health Academy Programs
      ('prog-nursing', 'demo-client', 'health-academy', 'nursing', 'Nursing',
        'Prepare for a rewarding career in healthcare', 1, true),
      ('prog-medical-assistant', 'demo-client', 'health-academy', 'medical-assistant', 'Medical Assistant',
        'Become a vital part of the healthcare team', 2, true),
      ('prog-dental-hygiene', 'demo-client', 'health-academy', 'dental-hygiene', 'Dental Hygiene',
        'Promote oral health and wellness', 3, true),
      ('prog-health-admin', 'demo-client', 'health-academy', 'healthcare-administration', 'Healthcare Administration',
        'Lead and manage healthcare facilities', 4, true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
    `);

    // ========================================================================
    // 6. QUIZ QUESTIONS
    // ========================================================================
    console.log("Creating quiz questions...");

    // Tech Institute Questions
    await pool.query(`
      INSERT INTO quiz_questions (id, client_id, account_id, question_text, question_type, display_order, is_active) VALUES
      ('q-tech-interest', 'demo-client', 'tech-institute', 'What area of technology interests you most?', 'single_choice', 1, true),
      ('q-tech-experience', 'demo-client', 'tech-institute', 'What is your current level of technical experience?', 'single_choice', 2, true),
      ('q-tech-goals', 'demo-client', 'tech-institute', 'What are your career goals?', 'multiple_choice', 3, true)
      ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text
    `);

    // Health Academy Questions
    await pool.query(`
      INSERT INTO quiz_questions (id, client_id, account_id, question_text, question_type, display_order, is_active) VALUES
      ('q-health-interest', 'demo-client', 'health-academy', 'What area of healthcare interests you most?', 'single_choice', 1, true),
      ('q-health-patient-care', 'demo-client', 'health-academy', 'Do you prefer direct patient care or administrative roles?', 'single_choice', 2, true),
      ('q-health-schedule', 'demo-client', 'health-academy', 'What type of work schedule do you prefer?', 'single_choice', 3, true)
      ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text
    `);

    // ========================================================================
    // 7. QUIZ ANSWER OPTIONS
    // ========================================================================
    console.log("Creating quiz answer options...");

    // Tech Institute Answer Options
    await pool.query(`
      INSERT INTO quiz_answer_options (id, client_id, question_id, option_text, display_order, point_assignments) VALUES
      -- Q1: Technology Interest
      ('opt-tech-dev', 'demo-client', 'q-tech-interest', 'Building apps and websites', 1, '{"prog-software-dev": 10, "prog-cloud-computing": 5}'),
      ('opt-tech-data', 'demo-client', 'q-tech-interest', 'Analyzing data and patterns', 2, '{"prog-data-science": 10, "prog-software-dev": 3}'),
      ('opt-tech-security', 'demo-client', 'q-tech-interest', 'Protecting systems and data', 3, '{"prog-cybersecurity": 10}'),
      ('opt-tech-infrastructure', 'demo-client', 'q-tech-interest', 'Managing servers and infrastructure', 4, '{"prog-cloud-computing": 10, "prog-cybersecurity": 5}'),

      -- Q2: Experience Level
      ('opt-exp-beginner', 'demo-client', 'q-tech-experience', 'Complete beginner', 1, '{"prog-software-dev": 5, "prog-data-science": 5}'),
      ('opt-exp-some', 'demo-client', 'q-tech-experience', 'Some experience', 2, '{"prog-software-dev": 7, "prog-cybersecurity": 7}'),
      ('opt-exp-advanced', 'demo-client', 'q-tech-experience', 'Advanced', 3, '{"prog-cloud-computing": 8, "prog-cybersecurity": 8}'),

      -- Q3: Career Goals
      ('opt-goal-job-switch', 'demo-client', 'q-tech-goals', 'Switch to tech career', 1, '{"prog-software-dev": 6}'),
      ('opt-goal-skill-up', 'demo-client', 'q-tech-goals', 'Upgrade my skills', 2, '{"prog-data-science": 6, "prog-cloud-computing": 6}'),
      ('opt-goal-freelance', 'demo-client', 'q-tech-goals', 'Become a freelancer', 3, '{"prog-software-dev": 8}')
      ON CONFLICT (id) DO UPDATE SET option_text = EXCLUDED.option_text
    `);

    // Health Academy Answer Options
    await pool.query(`
      INSERT INTO quiz_answer_options (id, client_id, question_id, option_text, display_order, point_assignments) VALUES
      -- Q1: Healthcare Interest
      ('opt-health-nursing', 'demo-client', 'q-health-interest', 'Patient care and nursing', 1, '{"prog-nursing": 10, "prog-medical-assistant": 5}'),
      ('opt-health-dental', 'demo-client', 'q-health-interest', 'Dental health', 2, '{"prog-dental-hygiene": 10}'),
      ('opt-health-admin', 'demo-client', 'q-health-interest', 'Healthcare management', 3, '{"prog-health-admin": 10}'),
      ('opt-health-assistant', 'demo-client', 'q-health-interest', 'Supporting medical staff', 4, '{"prog-medical-assistant": 10}'),

      -- Q2: Patient Care Preference
      ('opt-care-direct', 'demo-client', 'q-health-patient-care', 'Direct patient care', 1, '{"prog-nursing": 8, "prog-medical-assistant": 8, "prog-dental-hygiene": 6}'),
      ('opt-care-admin', 'demo-client', 'q-health-patient-care', 'Administrative/Management', 2, '{"prog-health-admin": 10}'),
      ('opt-care-mix', 'demo-client', 'q-health-patient-care', 'Mix of both', 3, '{"prog-medical-assistant": 7, "prog-health-admin": 5}'),

      -- Q3: Schedule Preference
      ('opt-schedule-flexible', 'demo-client', 'q-health-schedule', 'Flexible hours', 1, '{"prog-health-admin": 5}'),
      ('opt-schedule-standard', 'demo-client', 'q-health-schedule', 'Standard business hours', 2, '{"prog-dental-hygiene": 7, "prog-health-admin": 6}'),
      ('opt-schedule-shifts', 'demo-client', 'q-health-schedule', 'Shift work (includes nights/weekends)', 3, '{"prog-nursing": 8}')
      ON CONFLICT (id) DO UPDATE SET option_text = EXCLUDED.option_text
    `);

    // ========================================================================
    // 8. LANDING PAGE QUESTIONS
    // ========================================================================
    console.log("Creating landing page questions...");

    await pool.query(`
      INSERT INTO landing_page_questions (id, account_id, question_text, question_type, display_order, is_required, is_active) VALUES
      ('lpq-tech-zip', 'tech-institute', 'What is your ZIP code?', 'zip', 1, true, true),
      ('lpq-health-zip', 'health-academy', 'What is your ZIP code?', 'zip', 1, true, true)
      ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text
    `);

    // ========================================================================
    // 9. WEBHOOK CONFIGS
    // ========================================================================
    console.log("Creating webhook configs...");

    await pool.query(`
      INSERT INTO webhook_configs (account_id, webhook_url, events, headers, is_active) VALUES
      ('tech-institute', 'http://webhook-mock:1080/webhook/crm',
        ARRAY['submission_created', 'quiz_completed'],
        '{"Authorization": "Bearer local-dev-token"}'::jsonb,
        true),
      ('health-academy', 'http://webhook-mock:1080/webhook/crm',
        ARRAY['submission_created', 'quiz_completed'],
        '{"Authorization": "Bearer local-dev-token"}'::jsonb,
        true)
      ON CONFLICT DO NOTHING
    `);

    // ========================================================================
    // 10. ADMIN USERS
    // ========================================================================
    console.log("Creating admin users...");

    // Hash password for test users (password: "admin123")
    const passwordHash = await bcrypt.hash("admin123", 10);

    const usersResult = await pool.query(`
      INSERT INTO users (client_id, email, password_hash, email_verified, first_name, last_name, is_active) VALUES
      ('demo-client', 'admin@demo.local', $1, true, 'Admin', 'User', true),
      ('demo-client', 'tech@demo.local', $1, true, 'Tech', 'Admin', true),
      ('demo-client', 'health@demo.local', $1, true, 'Health', 'Admin', true)
      ON CONFLICT (client_id, LOWER(email)) WHERE is_active = true DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified = EXCLUDED.email_verified
      RETURNING id, email
    `, [passwordHash]);

    // ========================================================================
    // 11. USER ROLES
    // ========================================================================
    console.log("Creating user roles...");

    const adminUser = usersResult.rows.find(u => u.email === 'admin@demo.local');
    const techUser = usersResult.rows.find(u => u.email === 'tech@demo.local');
    const healthUser = usersResult.rows.find(u => u.email === 'health@demo.local');

    if (adminUser) {
      await pool.query(`
        INSERT INTO user_roles (user_id, client_id, account_id, role) VALUES
        ($1, 'demo-client', NULL, 'client_admin')
        ON CONFLICT DO NOTHING
      `, [adminUser.id]);
    }

    if (techUser) {
      await pool.query(`
        INSERT INTO user_roles (user_id, client_id, account_id, role) VALUES
        ($1, 'demo-client', 'tech-institute', 'account_admin')
        ON CONFLICT DO NOTHING
      `, [techUser.id]);
    }

    if (healthUser) {
      await pool.query(`
        INSERT INTO user_roles (user_id, client_id, account_id, role) VALUES
        ($1, 'demo-client', 'health-academy', 'account_admin')
        ON CONFLICT DO NOTHING
      `, [healthUser.id]);
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log("\n✅ Seed data complete!\n");
    console.log("📊 Summary:");
    console.log("  - 1 client");
    console.log("  - 2 accounts (tech-institute, health-academy)");
    console.log("  - 6 locations (3 per account)");
    console.log("  - 8 programs (4 per account)");
    console.log("  - 6 quiz questions (3 per account)");
    console.log("  - 19 quiz answer options");
    console.log("  - 2 landing page questions");
    console.log("  - 2 webhook configs");
    console.log("  - 3 admin users");
    console.log("\n🔐 Admin Login Credentials:");
    console.log("  - admin@demo.local / admin123 (client admin)");
    console.log("  - tech@demo.local / admin123 (tech-institute admin)");
    console.log("  - health@demo.local / admin123 (health-academy admin)");
    console.log("\n🌐 Test URLs:");
    console.log("  - http://localhost:3000/tech-institute");
    console.log("  - http://localhost:3000/health-academy");
    console.log("\n📧 Email testing:");
    console.log("  - Mailhog UI: http://localhost:8025");
    console.log("\n🪝 Webhook testing:");
    console.log("  - MockServer UI: http://localhost:1080/mockserver/dashboard");
    console.log("\n👨‍💼 Admin dashboard:");
    console.log("  - Admin UI: http://localhost:3001/admin");
    console.log("");

  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
