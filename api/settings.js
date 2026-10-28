/**
 * /api/settings   (account + site settings; stateless auth)
 *   GET  ?action=site     -> public site settings (name, fees, currency)
 *   GET  ?action=profile  -> current user's profile (login required)
 *   POST { action: 'update_profile', name, email, phone, course }
 *   POST { action: 'change_password', current, new }
 *   POST { action: 'save_settings', institution_name, currency, registration_fee, certificate_fee }  (admin)
 * (Port of api/settings.php)
 */
'use strict';

const bcrypt = require('bcryptjs');
const CFG = require('../lib/config');
const { q, one } = require('../lib/db');
const { respond, fail, parseBody, handler } = require('../lib/http');
const auth = require('../lib/auth-cookie');

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
}

async function siteSettings() {
  const merged = {
    institution_name: CFG.institution,
    currency: CFG.currency,
    registration_fee: CFG.fees.registration,
    certificate_fee: CFG.fees.certificate,
  };
  const rows = await q('SELECT k, v FROM settings');
  rows.forEach(function (r) { merged[r.k] = r.v; });
  merged.registration_fee = parseInt(merged.registration_fee, 10) || 0;
  merged.certificate_fee = parseInt(merged.certificate_fee, 10) || 0;
  return merged;
}

module.exports = handler('settings', async function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const query = req.query || {};

  if (method === 'GET') {
    const action = query.action || 'site';
    if (action === 'site') return respond(res, { ok: true, settings: await siteSettings() });
    if (action === 'profile') {
      const me = auth.requireUser(req, res);
      if (!me) return;
      const profile = await one('SELECT id, full_name, email, phone, course, role FROM users WHERE id = ?', [Number(me.id)]);
      return respond(res, { ok: true, profile: profile });
    }
    return fail(res, 'unknown action');
  }

  const b = await parseBody(req);
  const action = b.action || '';

  if (action === 'update_profile') {
    const me = auth.requireUser(req, res);
    if (!me) return;
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const course = String(b.course || '').trim();
    if (name === '' || email === '') return fail(res, 'name and email are required');
    if (!validEmail(email)) return fail(res, 'enter a valid email address');
    const clash = await one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, Number(me.id)]);
    if (clash) return fail(res, 'that email belongs to another account');

    await q('UPDATE users SET full_name = ?, email = ?, phone = ?, course = ? WHERE id = ?',
      [name, email, phone, course, Number(me.id)]);
    const user = { id: Number(me.id), name: name, email: email, phone: phone, course: course, role: me.role };
    auth.setSession(res, user); // refresh the signed cookie with new details
    return respond(res, { ok: true, user: user });
  }

  if (action === 'change_password') {
    const me = auth.requireUser(req, res);
    if (!me) return;
    const current = String(b.current || '');
    const neu = String(b.new || '');
    if (neu.length < 6) return fail(res, 'new password must be at least 6 characters');
    const row = await one('SELECT password_hash FROM users WHERE id = ?', [Number(me.id)]);
    const hash = row ? String(row.password_hash) : '';
    const okPw = await bcrypt.compare(current, hash);
    if (!okPw) return fail(res, 'current password is incorrect', 403);
    await q('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(neu, 10), Number(me.id)]);
    return respond(res, { ok: true });
  }

  if (action === 'save_settings') {
    const me = auth.requireRole(req, res, 'admin');
    if (!me) return;
    const map = {
      institution_name: String(b.institution_name || '').trim(),
      currency: String(b.currency || '').trim().toUpperCase(),
      registration_fee: String(parseInt(b.registration_fee, 10) || 0),
      certificate_fee: String(parseInt(b.certificate_fee, 10) || 0),
    };
    for (const k of Object.keys(map)) {
      if (map[k] === '') continue;
      await q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, map[k]]);
    }
    return respond(res, { ok: true, settings: await siteSettings() });
  }

  return fail(res, 'unknown action');
});
