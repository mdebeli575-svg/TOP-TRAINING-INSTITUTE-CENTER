/**
 * POST /api/leads
 *   { action: 'create', lead: { name, phone, course, branch } }
 *   { action: 'status', id, status }
 * (Port of api/leads.php)
 */
'use strict';

const { q, one } = require('../lib/db');
const { respond, fail, parseBody, requireMethod, handler } = require('../lib/http');

module.exports = handler('leads', async function (req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  const body = await parseBody(req);
  const action = body.action || 'create';

  if (action === 'create') {
    const d = body.lead || {};
    const name = String(d.name || '').trim();
    const phone = String(d.phone || '').trim();
    const course = String(d.course || '').trim();
    const branch = String(d.branch || '').trim();
    if (name === '' || phone === '') return fail(res, 'name and phone are required');

    const result = await q(
      'INSERT INTO students (full_name, phone, course, branch, status) VALUES (?, ?, ?, ?, "Pending")',
      [name, phone, course, branch]
    );
    return respond(res, {
      ok: true,
      lead: {
        id: Number(result.insertId), name: name, phone: phone,
        course: course, branch: branch, status: 'Pending',
      },
    });
  }

  if (action === 'status') {
    const id = parseInt(body.id, 10) || 0;
    const status = String(body.status || '');
    if (['Pending', 'Contacted', 'Enrolled'].indexOf(status) === -1) return fail(res, 'invalid status');
    await q('UPDATE students SET status = ? WHERE id = ?', [status, id]);
    return respond(res, { ok: true, id: id, status: status });
  }

  return fail(res, 'unknown action');
});
