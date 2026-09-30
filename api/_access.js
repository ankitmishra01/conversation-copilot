// api/_access.js
// Shared gate for every API route: the private key and two optional guards (an access window and a spend
// reserve). Both guards are OFF by default; a deployment opts in by setting the matching env vars.
const crypto = require("crypto");

function keyOk(req) {
  const required = process.env.COPILOT_KEY;
  if (!required) return true;
  const sent = String((req && req.headers && (req.headers["x-copilot-key"] || req.headers["X-Copilot-Key"])) || "");
  const a = Buffer.from(sent);
  const b = Buffer.from(required);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
function reserveConfig() {
  const usd = process.env.COPILOT_RESERVE_USD !== undefined ? Number(process.env.COPILOT_RESERVE_USD) : 0;
  const untilRaw = process.env.COPILOT_RESERVE_UNTIL;
  const untilMs = untilRaw ? Date.parse(untilRaw) : 0;
  return { usd: Number.isFinite(usd) ? usd : 0, untilMs: Number.isFinite(untilMs) ? untilMs : 0 };
}

async function reserveGuard(token, extraReserveUsd) {
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

module.exports = { keyOk, accessState, reserveGuard, reserveConfig, resetReserveCache };
