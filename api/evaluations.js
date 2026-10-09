const { keyOk, authenticate, rateLimit } = require("./_access");
const { createEvalStore } = require("./_eval-store");
const evalLedger = require("../eval-ledger");

function send(res, status, value) {
  if (typeof res.status === "function" && typeof res.json === "function") return res.status(status).json(value);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(value));
}

function normalizeEvaluation(body, workspace) {
  const input = body || {};
  if (!String(input.idempotencyKey || "").trim()) return { error: "idempotency_key_required" };
  if (!String(input.runId || "").trim()) return { error: "run_id_required" };
  if (["follow-up", "crm"].indexOf(input.artifactType) === -1) return { error: "artifact_type_invalid" };
  if (input.decision === "rejected" && !String(input.reason || "").trim()) return { error: "rejection_reason_required" };
  try {
    const event = evalLedger.createDecisionEvent(input);
    return {
      workspace: workspace || "default",
      idempotencyKey: String(input.idempotencyKey),
      runId: String(input.runId),
      artifactType: event.artifactType,
      decision: event.decision,
      reason: event.reason,
      original: event.original,
      final: event.final,
      edited: event.edited,
      editRatio: event.editRatio,
      decisionSeconds: event.decisionSeconds,
      completed: event.completed,
      decisionSource: event.decisionSource,
      demoVersion: event.demoVersion,
      appliedRuleIds: event.appliedRuleIds
    };
  } catch (error) {
    return { error: "evaluation_invalid" };
  }
}

function createHandler(store) {
  return async function handler(req, res) {
    res.setHeader("Allow", "POST");
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    const auth = authenticate(req);
    if (!auth.ok) return send(res, 401, { error: "key_required" });
    const limited = rateLimit(req, "evaluations", 60);
    if (!limited.ok) { res.setHeader("Retry-After", String(limited.retryAfter)); return send(res, 429, { error: "rate_limited", retryAfter: limited.retryAfter }); }
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (error) { return send(res, 400, { error: "invalid_json" }); }
    }
    const input = normalizeEvaluation(body, auth.workspace);
    if (input.error) return send(res, 400, input);
    try {
      return send(res, 201, await store.saveEvaluation(input));
    } catch (error) {
      return send(res, error && error.message === "artifact_not_found" ? 404 : 503, { error: error && error.message === "artifact_not_found" ? "artifact_not_found" : "database_unavailable" });
    }
  };
}

module.exports = createHandler(createEvalStore());
module.exports.createHandler = createHandler;
module.exports.normalizeEvaluation = normalizeEvaluation;
