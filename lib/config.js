/**
 * Central environment configuration for the Vercel/TiDB backend.
 * Mirrors the old api/config.php, but reads secrets from env vars only.
 */
'use strict';

function intOr(v, d) {
  var n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

module.exports = {
  db: {
    host: process.env.TTI_DB_HOST || '127.0.0.1',
    port: intOr(process.env.TTI_DB_PORT, 3306),
    user: process.env.TTI_DB_USER || 'root',
    password: process.env.TTI_DB_PASS || '',
    database: process.env.TTI_DB_NAME || 'top_training_center',
    // TiDB Serverless requires TLS; a local MySQL usually does not.
    ssl: String(process.env.TTI_DB_SSL || 'true').toLowerCase() !== 'false',
  },

  sessionSecret: process.env.TTI_SESSION_SECRET || '',

  admin: {
    email: (process.env.TTI_ADMIN_EMAIL || '').toLowerCase(),
    password: process.env.TTI_ADMIN_PASS || '',
    name: process.env.TTI_ADMIN_NAME || 'System Administrator',
  },

  institution: process.env.TTI_INSTITUTION || 'TOP TRAINING INSTITUTE',
  currency: process.env.TTI_CURRENCY || 'ETB',
  fees: {
    registration: intOr(process.env.TTI_FEE_REG, 500),
    certificate: intOr(process.env.TTI_FEE_CERT, 200),
  },

  telebirr: {
    mode: (process.env.TTI_TELEBIRR_MODE || 'sandbox').toLowerCase(),
  },
};
