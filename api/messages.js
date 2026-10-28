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

function trimWidth(s, w) {
  s = String(s == null ? '' : s);
  return s.length > w ? s.slice(0, w - 3) + '...' : s;
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
