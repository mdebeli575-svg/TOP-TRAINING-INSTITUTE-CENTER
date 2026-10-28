/**
 * HTTP helpers mirroring the PHP bootstrap's tti_respond / tti_fail /
 * tti_require_method / tti_body behaviour, so responses keep the exact JSON
 * shape the frontend already parses ({ok, ...} or {ok:false, error}).
 */
'use strict';

function respond(res, data, code) {
  res.status(code || 200).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(data));
}

function fail(res, msg, code) {
  respond(res, { ok: false, error: String(msg || 'error') }, code || 400);
}

/** Return the parsed JSON body (works with Vercel's auto-parsed body too). */
async function parseBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
    }
    if (typeof req.body === 'object') return req.body;
  }
  // Fallback: read the raw stream (e.g. vercel dev without body parsing).
  return await new Promise(function (resolve) {
    let raw = '';
    req.on('data', function (c) { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

/** Method guard: responds 405 "{METHOD} required" and returns false on mismatch. */
function requireMethod(req, res, method) {
  if (String(req.method || 'GET').toUpperCase() !== String(method).toUpperCase()) {
    fail(res, method + ' required', 405);
    return false;
  }
  return true;
}

/**
 * Infrastructure/connection failures can leak internal host:port details to
 * the browser. Map them to a generic message; keep genuine validation/app
 * errors verbatim (the frontend surfaces `error` directly).
 */
var DB_DOWN = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ER_ACCESS_DENIED|PROTOCOL_CONNECTION_LOST|Handshake|getaddrinfo|connect ECONN|Bad handshake/i;

/**
 * Wrap an async handler so any thrown error becomes a JSON 500 prefixed with
 * the endpoint name, matching the PHP `catch (Throwable)` behaviour.
 */
function handler(name, fn) {
  return async function (req, res) {
    try {
      await fn(req, res);
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (DB_DOWN.test(msg)) {
        // Server-side log for operators; client gets a safe generic message.
        console.error('[' + name + '] database unavailable: ' + msg);
        fail(res, name + ': database unavailable, please retry shortly', 503);
      } else {
        fail(res, name + ': ' + msg, 500);
      }
    }
  };
}

module.exports = { respond, fail, parseBody, requireMethod, handler };
