// File path: backend/database/seed.js
// Purpose: Applies schema.sql and creates a default admin account plus
// its business profile. Idempotent — safe to re-run.
//
// Usage: npm run seed   (from backend/)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function run() {
  // Running schema.sql requires executing multiple ';'-separated
  // CREATE TABLE statements in one call. mysql2's shared pool
  // deliberately does NOT enable `multipleStatements` (it would widen
  // the SQL-injection blast radius on every other query in the app), so
  // we open one dedicated, short-lived connection with that flag just
  // for this one-time schema load.
  const schemaConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    console.log('Applying schema.sql ...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await schemaConnection.query(schemaSql);
    console.log('Schema applied.');
  } finally {
    await schemaConnection.end();
  }

  try {
    const adminEmail = 'admin@insightai.com';
    const adminPassword = 'Admin@12345';
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const { rows: existing } = await require('../config/db').query(
      'SELECT id FROM users WHERE email = ?',
      [adminEmail]
    );

    if (existing.length === 0) {
      const { insertId: userId } = await require('../config/db').query(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
        ['Platform Admin', adminEmail, passwordHash]
      );
      await require('../config/db').query(
        `INSERT INTO businesses (user_id, business_name) VALUES (?, ?)`,
        [userId, 'InsightAI Admin']
      );
      console.log(`Default admin created -> email: ${adminEmail} / password: ${adminPassword}`);
    } else {
      console.log('Default admin already exists, skipped.');
    }

    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
