/**
 * TeleBirr "Request To Pay" client (sandbox only).
 * Mirrors api/lib/TeleBirr.php: sandbox returns a simulated push request so
 * the portal records a Pending payment end-to-end without any external call.
 */
'use strict';

const crypto = require('crypto');
const CFG = require('./config');

function requestToPay(amount, payerPhone, purpose) {
  const reference = 'TB-' + crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 10);

  if ((CFG.telebirr.mode || 'sandbox') !== 'live') {
    return {
      accepted: true,
      reference: reference,
      status: 'push_sent_sandbox',
      message: 'Sandbox TeleBirr push request created. Set TTI_TELEBIRR_MODE=live + merchant credentials to send a real *844# request.',
    };
  }

  // Live merchant integration is intentionally not wired here (no credentials
  // provided); behave as not-configured so the flow stays safe.
  return {
    accepted: false,
    reference: reference,
    status: 'not_configured',
    message: 'TeleBirr live mode selected but merchant integration is not configured on the serverless backend.',
  };
}

module.exports = { requestToPay };
