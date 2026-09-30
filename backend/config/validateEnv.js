// File path: backend/config/validateEnv.js
// Purpose: Fails fast on startup if required configuration is missing,
// instead of surfacing a confusing runtime error later (e.g. a mysterious
// pg connection failure or a JWT sign() crash on the first login attempt).

const REQUIRED_VARS = [
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET',
];

// Not required to boot, but the AI routes will fail at request time
// without it — worth a loud warning rather than a silent 500 later.
const RECOMMENDED_VARS = ['GEMINI_API_KEY'];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nCopy backend/.env.example to backend/.env and fill these in before starting the server.\n');
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 16) {
    console.warn('⚠️  JWT_SECRET is short. Use a long, random string in production.');
  }

  const missingRecommended = RECOMMENDED_VARS.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`⚠️  Missing recommended env vars (AI features will fail without them): ${missingRecommended.join(', ')}`);
  }
}

module.exports = validateEnv;
