// Shared helpers for the Flashcard Forge API functions.
//
// The whole backend is optional: served from GitHub Pages there are no /api
// routes at all and the app falls back to a browser-local card bank. On Vercel
// these functions provide a single shared, synced bank behind a site password.

const crypto = require('crypto');

const COOKIE_NAME = 'ff_session';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days
const BANK_KEY = 'flashcards:bank';

const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

// Upstash Redis. Provisioning sets either the KV_* names (legacy Vercel KV) or
// the UPSTASH_* names (Upstash Marketplace) — accept both, same as HolidayTracker.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let _redis = null;
function redis() {
  if (!KV_URL || !KV_TOKEN) return null;
  if (!_redis) {
    const { Redis } = require('@upstash/redis');
    _redis = new Redis({ url: KV_URL, token: KV_TOKEN });
  }
  return _redis;
}

/** Env vars that must be present for the backend to work at all. */
function configError() {
  const missing = [];
  if (!SITE_PASSWORD) missing.push('SITE_PASSWORD');
  if (!SESSION_SECRET) missing.push('SESSION_SECRET');
  if (!KV_URL || !KV_TOKEN) missing.push('KV_REST_API_URL + KV_REST_API_TOKEN');
  return missing.length ? 'Server is not configured yet. Missing: ' + missing.join(', ') + '.' : null;
}

/* ---------------- session cookie ---------------- */

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function makeToken() {
  const payload = String(Date.now() + MAX_AGE_S * 1000);
  return payload + '.' + sign(payload);
}

/** Constant-time compare of two strings that may differ in length. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Hash first so differing lengths don't leak via timingSafeEqual's length check.
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

function verifyToken(token) {
  if (!token || !SESSION_SECRET) return false;
  const i = token.lastIndexOf('.');
  if (i < 1) return false;
  const payload = token.slice(0, i);
  if (!safeEqual(token.slice(i + 1), sign(payload))) return false;
  const exp = parseInt(payload, 10);
  return Number.isFinite(exp) && Date.now() < exp;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function isAuthed(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

/**
 * Guard for routes that need a login. Returns true if the request may proceed;
 * otherwise it has already written the error response.
 */
function requireAuth(req, res) {
  const err = configError();
  if (err) { res.status(503).json({ error: err }); return false; }
  if (!isAuthed(req)) { res.status(401).json({ error: 'Not signed in.' }); return false; }
  return true;
}

/* ---------------- bank storage ---------------- */

function emptyBank() { return { cards: [], updatedAt: 0 }; }

async function loadBank() {
  const r = redis();
  if (!r) return emptyBank();
  const raw = await r.get(BANK_KEY);
  if (!raw) return emptyBank();
  // Upstash auto-deserialises JSON; tolerate both shapes.
  const bank = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!bank || !Array.isArray(bank.cards)) return emptyBank();
  return bank;
}

async function saveBank(bank) {
  const r = redis();
  if (!r) throw new Error('No storage configured.');
  const clean = { cards: Array.isArray(bank.cards) ? bank.cards : [], updatedAt: Date.now() };
  await r.set(BANK_KEY, JSON.stringify(clean));
  return clean;
}

/** Read and JSON-parse a request body across Vercel's parsed/raw variants. */
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

module.exports = {
  COOKIE_NAME, MAX_AGE_S, SITE_PASSWORD,
  configError, makeToken, safeEqual, verifyToken,
  readCookie, setSessionCookie, isAuthed, requireAuth,
  emptyBank, loadBank, saveBank, readJsonBody,
};
