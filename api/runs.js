const { keyOk, authenticate, rateLimit } = require("./_access");
const { createEvalStore } = require("./_eval-store");
const { normalizeAnalysis } = require("./close-loop");

const MAX_TRANSCRIPT_CHARS = 20000;

function send(res, status, value) {
  if (typeof res.status === "function" && typeof res.json === "function") return res.status(status).json(value);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(value));
}

function bodyFor(req) {
  if (!req || typeof req.body !== "string") return (req && req.body) || {};
  try { return JSON.parse(req.body); } catch (error) { return null; }
}

// The browser sends the analysis back, so nothing in it is trusted. Evidence is rebuilt from the saved
// transcript (quote verification is recomputed here, never read from the client). Only the semantic
// verdict is carried over, and only as a boolean keyed by evidence id.
function reverifyAnalysis(analysis, transcript) {
  const rebuilt = normalizeAnalysis(analysis, transcript);
  ["commitments", "blockers", "expansionSignals"].forEach((key) => {
    const sent = new Map((Array.isArray(analysis[key]) ? analysis[key] : []).map((item) => [String(item && item.id), item]));
    rebuilt[key].forEach((item) => {
      const original = sent.get(item.id);
      if (original && typeof original.supported === "boolean") item.supported = original.supported;
    });
  });
  const clientWarnings = Array.isArray(analysis.warnings) ? analysis.warnings.map((w) => String(w).slice(0, 300)) : [];
  rebuilt.warnings = Array.from(new Set(rebuilt.warnings.concat(clientWarnings))).slice(0, 50);
  return rebuilt;
}

function normalizeRun(body, workspace) {
  const input = body || {};
  const transcript = String(input.transcript || "").trim();
  if (!transcript) return { error: "transcript_required" };
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return { error: "transcript_too_long", maxChars: MAX_TRANSCRIPT_CHARS };
  if (!input.analysis || typeof input.analysis !== "object") return { error: "analysis_required" };
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) return { error: "idempotency_key_required" };
  return {
    workspace: workspace || "default",
    idempotencyKey,
    account: String(input.account || "Unknown account").slice(0, 200),
    scenario: String(input.scenario || "Conversation").slice(0, 300),
    transcript,
    datasetKind: input.datasetKind === "demo" ? "demo" : "live",
    model: String(input.model || "unknown").slice(0, 160),
    generatedAt: input.generatedAt || null,
    analysis: reverifyAnalysis(input.analysis, transcript)
  };
}

function createHandler(store) {
  return async function handler(req, res) {
    res.setHeader("Allow", "POST, DELETE");
    const auth = authenticate(req);
    if (!auth.ok) return send(res, 401, { error: "key_required" });
    const limited = rateLimit(req, "runs", 60);
    if (!limited.ok) { res.setHeader("Retry-After", String(limited.retryAfter)); return send(res, 429, { error: "rate_limited", retryAfter: limited.retryAfter }); }
    try {
      if (req.method === "POST") {
        const body = bodyFor(req);
        if (body === null) return send(res, 400, { error: "invalid_json" });
        const input = normalizeRun(body, auth.workspace);
        if (input.error) return send(res, input.error === "transcript_too_long" ? 413 : 400, input);
        return send(res, 201, await store.saveRun(input));
      }
      if (req.method === "DELETE") {
        const id = String((req.query && req.query.id) || "").trim();
        if (!id) return send(res, 400, { error: "run_id_required" });
        const deleted = await store.deleteRun(id, auth.workspace);
        return send(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: "run_not_found" });
      }
      return send(res, 405, { error: "method_not_allowed" });
    } catch (error) {
      return send(res, 503, { error: "database_unavailable" });
    }
  };
}

module.exports = createHandler(createEvalStore());
module.exports.createHandler = createHandler;
module.exports.normalizeRun = normalizeRun;
