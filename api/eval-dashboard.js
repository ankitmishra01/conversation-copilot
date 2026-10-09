const { keyOk, authenticate, rateLimit } = require("./_access");
const { createEvalStore } = require("./_eval-store");

function send(res, status, value) {
  if (typeof res.status === "function" && typeof res.json === "function") return res.status(status).json(value);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(value));
}

function createHandler(store) {
  return async function handler(req, res) {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
    const auth = authenticate(req);
    if (!auth.ok) return send(res, 401, { error: "key_required" });
    const limited = rateLimit(req, "eval-dashboard", 60);
    if (!limited.ok) { res.setHeader("Retry-After", String(limited.retryAfter)); return send(res, 429, { error: "rate_limited", retryAfter: limited.retryAfter }); }
    const query = req.query || {};
    const filters = {
      workspace: auth.workspace,
      dataset: ["all", "demo", "live"].includes(query.dataset) ? query.dataset : "all",
      artifact: ["all", "follow-up", "crm"].includes(query.artifact) ? query.artifact : "all"
    };
    try {
      return send(res, 200, await store.getDashboard(filters));
    } catch (error) {
      return send(res, 503, { error: "database_unavailable" });
    }
  };
}

module.exports = createHandler(createEvalStore());
module.exports.createHandler = createHandler;
