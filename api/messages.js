/**
 * /api/messages   (stateless auth via signed cookie; roles enforced)
 *   POST { action: 'send', body, subject?, user_id? }   user_id only for admin replies
 *   POST { action: 'mark_read', user_id? }
 *   GET  ?action=list                    -> user thread OR admin inbox
 *   GET  ?action=thread&user_id=ID       -> admin opens one thread
 * (Port of api/messages.php)
 */
'use strict';

const { q, one } = require('../lib/db');
const { respond, fail, parseBody, handler } = require('../lib/http');
const auth = require('../lib/auth-cookie');

/**
 * Code-point ranges that PHP's mb_strwidth() counts as display width 2 (Unicode
 * East Asian Wide/Fullwidth). Flat [start, end, start, end, ...] pairs; generated
 * by scanning every code point through PHP 8.2 rather than hand-typed, so it
 * matches the behaviour we are porting. Everything outside these ranges (ASCII,
 * Amharic/Ethiopic, Thai, Devanagari, Arabic, ...) counts as 1.
 */
var WIDE_RANGES = [0x1100, 0x115F, 0x231A, 0x231B, 0x2329, 0x232A, 0x23E9, 0x23EC, 0x23F0, 0x23F0, 0x23F3, 0x23F3, 0x25FD, 0x25FE, 0x2614, 0x2615, 0x2648, 0x2653, 0x267F, 0x267F, 0x2693, 0x2693, 0x26A1, 0x26A1, 0x26AA, 0x26AB, 0x26BD, 0x26BE, 0x26C4, 0x26C5, 0x26CE, 0x26CE, 0x26D4, 0x26D4, 0x26EA, 0x26EA, 0x26F2, 0x26F3, 0x26F5, 0x26F5, 0x26FA, 0x26FA, 0x26FD, 0x26FD, 0x2705, 0x2705, 0x270A, 0x270B, 0x2728, 0x2728, 0x274C, 0x274C, 0x274E, 0x274E, 0x2753, 0x2755, 0x2757, 0x2757, 0x2795, 0x2797, 0x27B0, 0x27B0, 0x27BF, 0x27BF, 0x2B1B, 0x2B1C, 0x2B50, 0x2B50, 0x2B55, 0x2B55, 0x2E80, 0x2E99, 0x2E9B, 0x2EF3, 0x2F00, 0x2FD5, 0x2FF0, 0x2FFB, 0x3000, 0x303E, 0x3041, 0x3096, 0x3099, 0x30FF, 0x3105, 0x312F, 0x3131, 0x318E, 0x3190, 0x31E3, 0x31F0, 0x321E, 0x3220, 0x3247, 0x3250, 0x4DBF, 0x4E00, 0xA48C, 0xA490, 0xA4C6, 0xA960, 0xA97C, 0xAC00, 0xD7A3, 0xF900, 0xFAFF, 0xFE10, 0xFE19, 0xFE30, 0xFE52, 0xFE54, 0xFE66, 0xFE68, 0xFE6B, 0xFF01, 0xFF60, 0xFFE0, 0xFFE6, 0x16FE0, 0x16FE4, 0x16FF0, 0x16FF1, 0x17000, 0x187F7, 0x18800, 0x18CD5, 0x18D00, 0x18D08, 0x1AFF0, 0x1AFF3, 0x1AFF5, 0x1AFFB, 0x1AFFD, 0x1AFFE, 0x1B000, 0x1B122, 0x1B150, 0x1B152, 0x1B164, 0x1B167, 0x1B170, 0x1B2FB, 0x1F004, 0x1F004, 0x1F0CF, 0x1F0CF, 0x1F18E, 0x1F18E, 0x1F191, 0x1F19A, 0x1F200, 0x1F202, 0x1F210, 0x1F23B, 0x1F240, 0x1F248, 0x1F250, 0x1F251, 0x1F260, 0x1F265, 0x1F300, 0x1F320, 0x1F32D, 0x1F335, 0x1F337, 0x1F37C, 0x1F37E, 0x1F393, 0x1F3A0, 0x1F3CA, 0x1F3CF, 0x1F3D3, 0x1F3E0, 0x1F3F0, 0x1F3F4, 0x1F3F4, 0x1F3F8, 0x1F43E, 0x1F440, 0x1F440, 0x1F442, 0x1F4FC, 0x1F4FF, 0x1F53D, 0x1F54B, 0x1F54E, 0x1F550, 0x1F567, 0x1F57A, 0x1F57A, 0x1F595, 0x1F596, 0x1F5A4, 0x1F5A4, 0x1F5FB, 0x1F64F, 0x1F680, 0x1F6C5, 0x1F6CC, 0x1F6CC, 0x1F6D0, 0x1F6D2, 0x1F6D5, 0x1F6D7, 0x1F6DD, 0x1F6DF, 0x1F6EB, 0x1F6EC, 0x1F6F4, 0x1F6FC, 0x1F7E0, 0x1F7EB, 0x1F7F0, 0x1F7F0, 0x1F90C, 0x1F93A, 0x1F93C, 0x1F945, 0x1F947, 0x1F9FF, 0x1FA70, 0x1FA74, 0x1FA78, 0x1FA7C, 0x1FA80, 0x1FA86, 0x1FA90, 0x1FAAC, 0x1FAB0, 0x1FABA, 0x1FAC0, 0x1FAC5, 0x1FAD0, 0x1FAD9, 0x1FAE0, 0x1FAE7, 0x1FAF0, 0x1FAF6, 0x20000, 0x2FFFD, 0x30000, 0x3FFFD];

/** Width of a single-code-point STRING. Accepts a number too, but must convert
 *  before comparing: `'a' < 0x1100` coerces the letter to NaN and is always
 *  false, which would silently make every character count as 1. */
function cpWidth(ch) {
  var cp = typeof ch === 'number' ? ch : ch.codePointAt(0);
  var lo = 0, hi = WIDE_RANGES.length / 2 - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (cp < WIDE_RANGES[mid * 2]) hi = mid - 1;
    else if (cp > WIDE_RANGES[mid * 2 + 1]) lo = mid + 1;
    else return 2;
  }
  return 1;
}

/**
 * Faithful port of mb_strimwidth($s, 0, $w, '...'): iterates code points (never
 * splits a surrogate pair, which .slice() would corrupt into invalid JSON),
 * measures in display width, and truncates only when the total width exceeds
 * $w, fitting the text plus the '...' suffix inside $w.
 */
function trimWidth(s, w) {
  s = String(s == null ? '' : s);
  var cps = Array.from(s);
  var total = 0;
  for (var i = 0; i < cps.length; i++) total += cpWidth(cps[i]);
  if (total <= w) return s;
  var budget = w - 3, out = '', used = 0;
  for (var j = 0; j < cps.length && used + cpWidth(cps[j]) <= budget; j++) {
    used += cpWidth(cps[j]);
    out += cps[j];
  }
  return out + '...';
}

module.exports = handler('messages', async function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const query = req.query || {};

  if (method === 'POST') {
    const b = await parseBody(req);
    const action = b.action || '';

    if (action === 'send') {
      const me = auth.requireUser(req, res);
      if (!me) return;
      const body = String(b.body || '').trim();
      const subject = String(b.subject || '').trim();
      if (body === '') return fail(res, 'message body is required');
      let uid, sender;
      if (me.role === 'admin') {
        uid = parseInt(b.user_id, 10) || 0;
        sender = 'admin';
        if (uid <= 0) return fail(res, 'user_id is required for admin replies');
      } else {
        uid = Number(me.id);
        sender = 'user';
      }
      const result = await q('INSERT INTO messages (user_id, sender, subject, body) VALUES (?, ?, ?, ?)', [uid, sender, subject, body]);
      return respond(res, { ok: true, id: Number(result.insertId) });
    }

    if (action === 'mark_read') {
      const me = auth.requireUser(req, res);
      if (!me) return;
      if (me.role === 'admin') {
        const uid = parseInt(b.user_id, 10) || 0;
        await q("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'user' AND is_read = 0", [uid]);
      } else {
        await q("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'admin' AND is_read = 0", [Number(me.id)]);
      }
      return respond(res, { ok: true });
    }

    return fail(res, 'unknown action');
  }

  // ---------------- GET: list / thread ----------------
  const action = query.action || 'list';

  if (action === 'list') {
    const me = auth.requireUser(req, res);
    if (!me) return;

    if (me.role === 'admin') {
      const rows = await q(
        "SELECT u.id AS user_id, u.full_name AS name, u.email, u.role, " +
        "(SELECT body FROM messages m WHERE m.user_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_body, " +
        "(SELECT created_at FROM messages m WHERE m.user_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_at, " +
        "(SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id AND m.sender = 'user' AND m.is_read = 0) AS unread " +
        "FROM users u WHERE EXISTS (SELECT 1 FROM messages m WHERE m.user_id = u.id) ORDER BY last_at DESC"
      );
      let totalUnread = 0;
      rows.forEach(function (r) {
        r.user_id = Number(r.user_id);
        r.unread = Number(r.unread);
        totalUnread += r.unread;
        r.last_body = trimWidth(r.last_body, 90);
      });
      return respond(res, { ok: true, inbox: rows, totalUnread: totalUnread });
    }

    const thread = await q('SELECT id, sender, subject, body, is_read, created_at FROM messages WHERE user_id = ? ORDER BY id ASC', [Number(me.id)]);
    return respond(res, { ok: true, thread: thread });
  }

  if (action === 'thread') {
    const me = auth.requireRole(req, res, 'admin');
    if (!me) return;
    const uid = parseInt(query.user_id, 10) || 0;
    const who = await one('SELECT id, full_name, email, role FROM users WHERE id = ?', [uid]);
    if (!who) return fail(res, 'user not found', 404);
    const thread = await q('SELECT id, sender, subject, body, is_read, created_at FROM messages WHERE user_id = ? ORDER BY id ASC', [uid]);
    await q("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'user' AND is_read = 0", [uid]);
    return respond(res, { ok: true, user: who, thread: thread });
  }

  return fail(res, 'unknown action');
});
