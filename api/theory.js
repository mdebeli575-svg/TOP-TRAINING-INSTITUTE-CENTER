/**
 * /api/theory
 *   GET  ?name=&course=  -> { ok, finished, progress:[...] }
 *   POST { name, course, finished, progress:[indices] }  -> upsert
 * (Port of api/theory.php)
 */
'use strict';

const { q, one } = require('../lib/db');
const { respond, fail, parseBody, handler } = require('../lib/http');

function parseProgress(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}

module.exports = handler('theory', async function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const query = req.query || {};

  if (method === 'GET') {
    const name = String(query.name || '').trim();
    const course = String(query.course || '').trim();
    if (name === '' || course === '') return fail(res, 'name and course query params required');
    const row = await one('SELECT finished, progress FROM theory_status WHERE student_name = ? AND course = ?', [name, course]);
    return respond(res, {
      ok: true,
      finished: row ? !!Number(row.finished) : false,
      progress: row ? parseProgress(row.progress) : [],
    });
  }

  if (method === 'POST') {
    const b = await parseBody(req);
    const name = String(b.name || '').trim();
    const course = String(b.course || '').trim();
    const finished = !!b.finished;
    let progress = b.progress || [];
    if (!Array.isArray(progress)) progress = [];
    progress = progress.map(function (x) { return parseInt(x, 10) || 0; });
    if (name === '' || course === '') return fail(res, 'name and course required');

    await q(
      'INSERT INTO theory_status (student_name, course, finished, progress) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE finished = VALUES(finished), progress = VALUES(progress)',
      [name, course, finished ? 1 : 0, JSON.stringify(progress)]
    );
    return respond(res, { ok: true, name: name, course: course, finished: finished, progress: progress });
  }

  return fail(res, 'unsupported method', 405);
});
