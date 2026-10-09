// api/_access.js
// Shared gate for every API route: the private key and two optional guards (an access window and a spend
// reserve). Both guards are OFF by default; a deployment opts in by setting the matching env vars.
const crypto = require("crypto");

// Auth is closed by default. Keys come from COPILOT_KEY (workspace "default") and/or COPILOT_KEYS, a
// comma-separated "workspace:key" list that maps each key to its own data workspace. With no key
// configured the API is only open for local development (VERCEL_ENV unset or "development") or when
// COPILOT_ALLOW_OPEN=1 is set explicitly; a production or preview deployment without a key rejects everything.
function configuredKeys() {
  const keys = [];
  if (process.env.COPILOT_KEY) keys.push({ workspace: "default", key: process.env.COPILOT_KEY });
  String(process.env.COPILOT_KEYS || "").split(",").forEach((entry) => {
    const at = entry.indexOf(":");
    if (at < 1 || at === entry.length - 1) return;
    keys.push({ workspace: entry.slice(0, at).trim(), key: entry.slice(at + 1).trim() });
  });
  return keys.filter((k) => k.workspace && k.key);
}

function openModeAllowed() {
  if (process.env.COPILOT_ALLOW_OPEN === "1") return true;
  const env = process.env.VERCEL_ENV;
  return !env || env === "development";
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return String(headers[name] || headers[name.toLowerCase()] || "");
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authenticate(req) {
  const keys = configuredKeys();
  if (!keys.length) return openModeAllowed() ? { ok: true, workspace: "default", open: true } : { ok: false, reason: "key_not_configured" };
  const sent = headerValue(req, "x-copilot-key");
  let match = null;
  keys.forEach((entry) => { if (safeEqual(sent, entry.key) && !match) match = entry; });
  return match ? { ok: true, workspace: match.workspace } : { ok: false, reason: "key_invalid" };
}

function keyOk(req) {
  return authenticate(req).ok;
}

// Per-instance sliding-window limiter. Serverless instances do not share memory, so this only caps abuse
// that lands on one warm instance; pair it with a Vercel WAF rate-limit rule for a hard global ceiling.
const rateBuckets = new Map();
function clientIp(req) {
  const forwarded = headerValue(req, "x-forwarded-for").split(",")[0].trim();
  return forwarded || headerValue(req, "x-real-ip") || (req && req.socket && req.socket.remoteAddress) || "unknown";
}

function rateLimit(req, bucket, defaultPerMinute) {
  const configured = Number(process.env.COPILOT_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(configured) && configured > 0 ? configured : defaultPerMinute;
  const windowMs = 60000;
  const now = Date.now();
  const id = bucket + "|" + clientIp(req) + "|" + (authenticate(req).workspace || "");
  const hits = (rateBuckets.get(id) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    rateBuckets.set(id, hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }
  hits.push(now);
  rateBuckets.set(id, hits);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (!v.length || now - v[v.length - 1] >= windowMs) rateBuckets.delete(k);
  }
  return { ok: true };
}

function resetRateLimits() { rateBuckets.clear(); }

function activeUntilMs() {
  const raw = process.env.COPILOT_ACTIVE_UNTIL;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function accessState() {
  const recalled = process.env.COPILOT_RECALL === "enabled";
  const untilMs = activeUntilMs();
  const now = Date.now();
  const active = recalled || untilMs === null || now <= untilMs;
  return {
    active,
    recalled,
    activeUntil: untilMs === null ? null : new Date(untilMs).toISOString(),
    message: recalled
      ? "Copilot access re-enabled."
      : untilMs === null
        ? "Copilot has no access window configured; it is always active."
        : active
          ? "Copilot active until " + new Date(untilMs).toLocaleString() + "."
          : "Copilot's access window closed on " + new Date(untilMs).toLocaleString() + ". Set COPILOT_RECALL=enabled to reopen it."
  };
}

const RESERVE_MARGIN_USD = 0.05;
const reserveCache = { at: 0, balance: null };
// A reserve set without an expiry applies indefinitely (until COPILOT_RESERVE_UNTIL is set or the
// reserve is cleared) rather than silently never applying — a reserve you configured protecting nothing
// would defeat the point of setting it.
const FAR_FUTURE_MS = Date.parse("2099-12-31T00:00:00Z");
function reserveConfig() {
  const usd = process.env.COPILOT_RESERVE_USD !== undefined ? Number(process.env.COPILOT_RESERVE_USD) : 0;
  const untilRaw = process.env.COPILOT_RESERVE_UNTIL;
  const untilMs = untilRaw ? Date.parse(untilRaw) : (usd > 0 ? FAR_FUTURE_MS : 0);
  return { usd: Number.isFinite(usd) ? usd : 0, untilMs: Number.isFinite(untilMs) ? untilMs : 0 };
}

// extraReserveUsd comes from the request body, so it is ignored unless the deployment opts in for load
// testing (COPILOT_ALLOW_RESERVE_TEST=1). Otherwise any caller could probe the credit balance.
async function reserveGuard(token, requestedReserveUsd) {
  const extraReserveUsd = process.env.COPILOT_ALLOW_RESERVE_TEST === "1" ? requestedReserveUsd : 0;
  const cfg = reserveConfig();
  const reserve = Math.max(cfg.usd, Number(extraReserveUsd) || 0);
  const now = Date.now();
  if (reserve <= 0 || (now >= cfg.untilMs && !extraReserveUsd) || !token) return { ok: true };
  if (!reserveCache.at || now - reserveCache.at > 15000) {
    if (!reserveCache.pending) {
      reserveCache.pending = (async () => {
        try {
          const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { "Authorization": `Bearer ${token}` } });
          const j = r.ok ? await r.json() : null;
          const value = j ? Number(j.balance) : NaN;
          if (!Number.isFinite(value)) return false;
          reserveCache.at = Date.now(); reserveCache.balance = value;
          return true;
        } catch (e) { return false; } finally { reserveCache.pending = null; }
      })();
    }
    if (!(await reserveCache.pending)) return { ok: true, unknown: true };
  }
  const balance = reserveCache.balance;
  const ok = balance > reserve + RESERVE_MARGIN_USD;
  return { ok, balance, reserve, availableForTesting: Math.max(0, balance - reserve - RESERVE_MARGIN_USD), until: cfg.untilMs ? new Date(cfg.untilMs).toISOString() : null };
}

function resetReserveCache() {
  reserveCache.at = 0; reserveCache.balance = null; reserveCache.pending = null;
}

module.exports = { keyOk, authenticate, rateLimit, resetRateLimits, clientIp, accessState, reserveGuard, reserveConfig, resetReserveCache };
