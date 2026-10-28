/**
 * Shared MySQL/TiDB access via mysql2/promise.
 * A single connection pool is reused across warm invocations of a function.
 */
'use strict';

const mysql = require('mysql2/promise');
const CFG = require('./config');

let pool = null;

function getPool() {
  if (pool) return pool;
  const d = CFG.db;
  pool = mysql.createPool({
    host: d.host,
    port: d.port,
    user: d.user,
    password: d.password,
    database: d.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: d.ssl ? { rejectUnauthorized: false } : undefined,
    // Return DECIMAL/BIGINT as numbers so the JSON matches the PHP output.
    decimalNumbers: true,
    dateStrings: true,
  });
  return pool;
}

// Run a parameterised query; returns the row array for SELECT/SHOW, else the
// mysql2 result object (with insertId / affectedRows).
async function q(sql, params) {
  const [rows] = await getPool().query(sql, params || []);
  return rows;
}

// First row or null.
async function one(sql, params) {
  const rows = await q(sql, params);
  return rows && rows.length ? rows[0] : null;
}

module.exports = { q, one, getPool };
