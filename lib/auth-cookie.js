/**
 * Stateless auth via an HMAC-signed, httpOnly cookie (a compact JWT-style
 * token). Replaces the PHP $_SESSION. Carries the same public user shape the
 * frontend expects: {id, name, email, phone, course, role}.
 */
'use strict';

const crypto = require('crypto');
const CFG = require('./config');
const { fail } = require('./http');

const COOKIE = 'tti_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}
function sign(payload) {
  return crypto.createHmac('sha256', CFG.sessionSecret || 'dev-insecure-secret')
    .update(payload).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Build a signed token string for the given user object. */
function signToken(user) {
  const body = b64url(JSON.stringify({ u: user, exp: Date.now() + TTL_MS }));
  return body + '.' + sign(body);
}

/** Verify a token string; returns the user object or null. */
function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  const body = parts[0];
  const sig = parts[1];
  const expected = sign(body);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(b64urlDecode(body));
    if (!data || !data.u || !data.exp || Date.now() > data.exp) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = (req.headers && req.headers.cookie) || '';
  const out = {};
  header.split(';').forEach(function (c) {
    const i = c.indexOf('=');
    if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

/** Current signed-in user (or null). */
function readUser(req) {
  return verifyToken(parseCookies(req)[COOKIE]);
}

/** Append a Set-Cookie header without clobbering existing ones. */
function pushCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  const arr = !prev ? [] : (Array.isArray(prev) ? prev : [prev]);
  arr.push(value);
  res.setHeader('Set-Cookie', arr);
}

function setSession(res, user) {
  pushCookie(res,
    COOKIE + '=' + signToken(user) +
    '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(TTL_MS / 1000));
}

function clearSession(res) {
  pushCookie(res, COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

/** Require any signed-in user or respond 401; returns the user or null. */
function requireUser(req, res) {
  const u = readUser(req);
  if (!u) { fail(res, 'authentication required', 401); return null; }
  return u;
}

/** Require a specific role or respond 401/403; returns the user or null. */
function requireRole(req, res, role) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (u.role !== role) { fail(res, role + ' access required', 403); return null; }
  return u;
}

module.exports = {
  COOKIE, signToken, verifyToken, readUser,
  setSession, clearSession, requireUser, requireRole,
};
