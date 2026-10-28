/**
 * POST /api/payments
 *   { action: 'create', payment: { name, phone, course, amount, method, trx_ref } }
 *   { action: 'verify'|'reject', id }
 *
 * TeleBirr uses the sandbox client; CBE records a bank-transfer reference for
 * manual verification. Both persist to `payments`. (Port of api/payments.php)
 */
'use strict';

const { q, one } = require('../lib/db');
const { respond, fail, parseBody, requireMethod, handler } = require('../lib/http');
const telebirr = require('../lib/telebirr');

async function uniqueRef(ref) {
  const row = await one('SELECT COUNT(*) AS c FROM payments WHERE reference = ?', [ref]);
  if (!row || Number(row.c) === 0) return ref;
  return ref + '-' + String(Date.now()).slice(-6);
}

module.exports = handler('payments', async function (req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  const body = await parseBody(req);
  const action = body.action || '';

  if (action === 'create') {
    const p = body.payment || {};
    const name = String(p.name || '').trim();
    const course = String(p.course || '').trim();
    const phone = String(p.phone || '').trim();
    const trx = String(p.trx_ref || '').trim();
    const amount = parseFloat(p.amount) || 0;
    const method = String(p.method || '').toLowerCase();

    if (name === '' || !(amount > 0)) return fail(res, 'name and a positive amount are required');
    if (['telebirr', 'cbe'].indexOf(method) === -1) return fail(res, 'method must be telebirr or cbe');

    let ref, gwStatus, gwMsg;
    if (method === 'telebirr') {
      if (!/^0[97][0-9]{8}$/.test(phone.replace(/[\s-]/g, ''))) {
        return fail(res, 'invalid TeleBirr number (expect 09/07 + 8 digits)');
      }
      const gw = telebirr.requestToPay(amount, phone, 'TTI ' + course);
      ref = gw.reference;
      gwStatus = gw.status;
      gwMsg = gw.message;
    } else {
      if (trx === '') return fail(res, 'CBE transaction reference is required');
      ref = trx;
      gwStatus = 'bank_transfer';
      gwMsg = 'Awaiting manual verification against the CBE statement';
    }

    ref = await uniqueRef(ref);

    const result = await q(
      'INSERT INTO payments (student_name, phone, course, amount, method, reference, gateway_status, gateway_message, status) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, "Pending")',
      [name, phone, course, amount, method, ref, gwStatus, gwMsg]
    );

    return respond(res, {
      ok: true,
      payment: {
        id: Number(result.insertId), name: name, course: course, amount: amount,
        method: method, ref: ref, status: 'Pending', date: new Date().toISOString().slice(0, 10),
      },
      gateway: { status: gwStatus, message: gwMsg },
    });
  }

  if (action === 'verify' || action === 'reject') {
    const id = parseInt(body.id, 10) || 0;
    const status = action === 'verify' ? 'Verified' : 'Rejected';
    const result = await q('UPDATE payments SET status = ? WHERE id = ?', [status, id]);
    if (!result.affectedRows) return fail(res, 'payment not found', 404);
    return respond(res, { ok: true, id: id, status: status });
  }

  return fail(res, 'unknown action');
});
