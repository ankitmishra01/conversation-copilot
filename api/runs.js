const { keyOk } = require("./_access");
const { createEvalStore } = require("./_eval-store");

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

function normalizeRun(body) {
  const input = body || {};
  const transcript = String(input.transcript || "").trim();
  if (!transcript) return { error: "transcript_required" };
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return { error: "transcript_too_long", maxChars: MAX_TRANSCRIPT_CHARS };
  if (!input.analysis || typeof input.analysis !== "object") return { error: "analysis_required" };
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) return { error: "idempotency_key_required" };
  return {
    idempotencyKey,
    account: String(input.account || "Unknown account").slice(0, 200),
    scenario: String(input.scenario || "Conversation").slice(0, 300),
    transcript,
    datasetKind: input.datasetKind === "demo" ? "demo" : "live",
    model: String(input.model || "unknown").slice(0, 160),
    generatedAt: input.generatedAt || null,
    analysis: input.analysis
  };
}

function createHandler(store) {
  return async function handler(req, res) {
    res.setHeader("Allow", "POST, DELETE");
    if (!keyOk(req)) return send(res, 401, { error: "key_required" });
    try {
      if (req.method === "POST") {
        const body = bodyFor(req);
        if (body === null) return send(res, 400, { error: "invalid_json" });
        const input = normalizeRun(body);
        if (input.error) return send(res, input.error === "transcript_too_long" ? 413 : 400, input);
        return send(res, 201, await store.saveRun(input));
      }
      if (req.method === "DELETE") {
        const id = String((req.query && req.query.id) || "").trim();
        if (!id) return send(res, 400, { error: "run_id_required" });
        const deleted = await store.deleteRun(id);
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
