/**
 * Script to add a super admin user
 * Usage: npx tsx scripts/add-super-admin.ts <email> <password>
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: npx tsx scripts/add-super-admin.ts <email> <password>");
  process.exit(1);
}

async function addSuperAdmin() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("🔍 Checking if user exists...");

    // Check if user exists
    const userCheck = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    let userId: string;

    if (userCheck.rows.length > 0) {
      userId = userCheck.rows[0].id;
      console.log(`✅ User found: ${email} (${userId})`);

      // Update password
      const passwordHash = await bcrypt.hash(password, 12);
      await pool.query(
        "UPDATE users SET password_hash = $1, is_active = true WHERE id = $2",
        [passwordHash, userId]
      );
      console.log("✅ Password updated");
    } else {
      // Create new user
      userId = uuidv4();
      const passwordHash = await bcrypt.hash(password, 12);

      await pool.query(
        `INSERT INTO users (id, email, password_hash, email_verified, client_id, is_active)
         VALUES ($1, $2, $3, true, NULL, true)`,
        [userId, email.toLowerCase(), passwordHash]
      );
      console.log(`✅ User created: ${email} (${userId})`);
    }

    // Check if super_admin role exists
    const roleCheck = await pool.query(
      "SELECT * FROM user_roles WHERE user_id = $1 AND role = 'super_admin'",
      [userId]
    );

    if (roleCheck.rows.length > 0) {
      console.log("✅ Super admin role already exists");
    } else {
      // Add super_admin role
      await pool.query(
        "INSERT INTO user_roles (user_id, role, school_id) VALUES ($1, 'super_admin', NULL)",
        [userId]
      );
      console.log("✅ Super admin role added");
    }

    // Verify
    const verification = await pool.query(
      `SELECT u.id, u.email, u.is_active, ur.role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    console.log("\n✅ Super admin setup complete!");
    console.log("\nUser details:");
    console.log(JSON.stringify(verification.rows, null, 2));
    console.log("\n🔐 You can now log in at /super/login with:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: [the password you provided]`);

    await pool.end();
  } catch (error) {
    console.error("❌ Error:", error);
    await pool.end();
    process.exit(1);
  }
}

addSuperAdmin();
