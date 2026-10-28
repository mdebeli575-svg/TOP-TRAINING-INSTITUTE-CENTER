/**
 * POST /api/auth   (stateless signed-cookie auth)
 *   { action: 'register', name, email, phone, course, password, role }
 *   { action: 'login',    email, password }
 *   { action: 'logout' }
 *   { action: 'me' }            -> also accepts GET ?action=me
 *
 * Roles: 'student' and 'user' self-register. 'admin' is bootstrapped on first
 * login from TTI_ADMIN_EMAIL / TTI_ADMIN_PASS and is never self-registrable.
 * (Port of api/auth.php)
 */
'use strict';

const bcrypt = require('bcryptjs');
const CFG = require('../lib/config');
const { q, one } = require('../lib/db');
const { respond, fail, parseBody, handler } = require('../lib/http');
const auth = require('../lib/auth-cookie');

function toPublicUser(row) {
  return {
    id: Number(row.id),
    name: row.full_name,
    email: row.email,
    phone: row.phone || '',
    course: row.course || '',
    role: row.role,
  };
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
}

async function insertUser(name, email, phone, course, hash, role) {
  const result = await q(
    'INSERT INTO users (full_name, email, phone, course, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, phone || '', course || '', hash, role]
  );
  const row = await one('SELECT * FROM users WHERE id = ?', [result.insertId]);
  return row;
}

module.exports = handler('auth', async function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const body = method === 'POST' ? await parseBody(req) : {};
  const query = req.query || {};
  const action = body.action || query.action || 'me';

  // ---------------- me ----------------
  if (action === 'me') {
    return respond(res, { ok: true, user: auth.readUser(req) });
  }

  // ---------------- logout ----------------
  if (action === 'logout') {
    auth.clearSession(res);
    return respond(res, { ok: true, user: null });
  }

  if (method !== 'POST') {
    return fail(res, 'POST required', 405);
  }

  // ---------------- register ----------------
  if (action === 'register') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const course = String(body.course || '').trim();
    const password = String(body.password || '');
    const role = String(body.role || 'user');

    if (name === '' || email === '') return fail(res, 'name and email are required');
    if (!validEmail(email)) return fail(res, 'enter a valid email address');
    if (password.length < 6) return fail(res, 'password must be at least 6 characters');
    if (['student', 'user'].indexOf(role) === -1) return fail(res, 'account type must be student or user');

    const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return fail(res, 'an account with this email already exists');

    const hash = await bcrypt.hash(password, 10);
    const row = await insertUser(name, email, phone, course, hash, role);
    const user = toPublicUser(row);
    auth.setSession(res, user);
    return respond(res, { ok: true, user: user });
  }

  // ---------------- login ----------------
  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (email === '' || password === '') return fail(res, 'email and password are required');

    let row = await one('SELECT * FROM users WHERE email = ?', [email]);

    // Bootstrap the configured administrator on first login.
    const admin = CFG.admin;
    if (!row && admin.email && email === admin.email && password === admin.password) {
      const hash = await bcrypt.hash(admin.password, 10);
      row = await insertUser(admin.name, admin.email, '', '', hash, 'admin');
    }

    if (!row) return fail(res, 'invalid email or password', 401);

    const okPw = await bcrypt.compare(password, String(row.password_hash));
    if (!okPw) return fail(res, 'invalid email or password', 401);

    const user = toPublicUser(row);
    auth.setSession(res, user);
    return respond(res, { ok: true, user: user });
  }

  return fail(res, 'unknown action');
});
