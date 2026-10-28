/**
 * GET /api/bootstrap
 * Returns all portal state in one call so the client renders synchronously:
 *   { ok, server:true, leads[], payments[], theory{} }
 * (Port of api/bootstrap.php)
 */
'use strict';

const { q } = require('../lib/db');
const { respond, handler } = require('../lib/http');

function asProgress(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}

module.exports = handler('bootstrap', async function (req, res) {
  const leads = await q(
    'SELECT id, full_name AS name, phone, course, branch, status FROM students ORDER BY id DESC'
  );

  const payments = await q(
    "SELECT id, student_name AS name, course, amount, method, reference AS ref, status, " +
    "DATE_FORMAT(created_at, '%Y-%m-%d') AS date FROM payments ORDER BY id DESC"
  );
  payments.forEach(function (p) {
    p.amount = Number(p.amount);
    p.id = Number(p.id);
  });

  const theory = {};
  const trows = await q('SELECT student_name, course, finished, progress FROM theory_status');
  trows.forEach(function (t) {
    const key = (t.student_name + '||' + t.course).toLowerCase();
    theory[key] = !!Number(t.finished);
    theory['progress_' + key] = asProgress(t.progress);
  });

  respond(res, { ok: true, server: true, leads: leads, payments: payments, theory: theory });
});
