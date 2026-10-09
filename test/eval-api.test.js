const assert = require("assert");

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: "" };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.json = (value) => { res.body = JSON.stringify(value); return res; };
  res.end = (value) => { res.body = value || ""; return res; };
  return res;
}

async function run() {
  const runsApi = require("../api/runs");
  const evaluationsApi = require("../api/evaluations");
  const dashboardApi = require("../api/eval-dashboard");
  const calls = [];
  const store = {
    saveRun: async (value) => { calls.push(["save", value]); return { runId: "run-1", savedAt: "2026-10-03T18:00:00.000Z" }; },
    deleteRun: async (id) => { calls.push(["delete", id]); return true; },
    saveEvaluation: async (value) => { calls.push(["evaluation", value]); return Object.assign({ id: "eval-1" }, value); },
    getDashboard: async (filters) => { calls.push(["dashboard", filters]); return { summary: { totalDecisions: 4 } }; }
  };

  const missing = fakeRes();
  await runsApi.createHandler(store)({ method: "POST", headers: {}, body: { transcript: "" } }, missing);
  assert.strictEqual(missing.statusCode, 400);
  assert.strictEqual(JSON.parse(missing.body).error, "transcript_required");

  const saved = fakeRes();
  await runsApi.createHandler(store)({ method: "POST", headers: {}, body: {
    idempotencyKey: "save-demo-1",
    account: "Northstar Analytics",
    scenario: "Renewal call",
    transcript: "Ava: I will send the packet Friday.",
    datasetKind: "demo",
    model: "verified-fixture",
    analysis: { summary: "Renewal pending security.", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "Next steps", body: "Packet Friday." }, crm: { summary: "Pending.", nextStep: "Send packet" } }
  } }, saved);
  assert.strictEqual(saved.statusCode, 201);
  assert.strictEqual(JSON.parse(saved.body).runId, "run-1");
  assert.strictEqual(calls[0][1].datasetKind, "demo");

  const deleted = fakeRes();
  await runsApi.createHandler(store)({ method: "DELETE", headers: {}, query: { id: "run-1" } }, deleted);
  assert.strictEqual(deleted.statusCode, 200);
  assert.deepStrictEqual(calls[1], ["delete", "run-1"]);

  const evaluated = fakeRes();
  await evaluationsApi.createHandler(store)({ method: "POST", headers: {}, body: {
    idempotencyKey: "eval-demo-1",
    runId: "run-1",
    artifactType: "follow-up",
    decision: "approved",
    original: "Send packet Friday",
    final: "Send security packet Friday",
    startedAt: "2026-10-03T18:00:00.000Z",
    decidedAt: "2026-10-03T18:00:20.000Z",
    completed: true
  } }, evaluated);
  assert.strictEqual(evaluated.statusCode, 201);
  const evaluationCall = calls[2][1];
  assert.strictEqual(evaluationCall.editRatio, 0.25, "the server must derive edit distance");
  assert.strictEqual(evaluationCall.decisionSeconds, 20, "the server must derive decision time");

  const rejected = fakeRes();
  await evaluationsApi.createHandler(store)({ method: "POST", headers: {}, body: {
    idempotencyKey: "eval-demo-2", runId: "run-1", artifactType: "crm", decision: "rejected", reason: ""
  } }, rejected);
  assert.strictEqual(rejected.statusCode, 400);
  assert.strictEqual(JSON.parse(rejected.body).error, "rejection_reason_required");

  const dashboard = fakeRes();
  await dashboardApi.createHandler(store)({ method: "GET", headers: {}, query: { dataset: "demo", artifact: "all" } }, dashboard);
  assert.strictEqual(dashboard.statusCode, 200);
  assert.strictEqual(JSON.parse(dashboard.body).summary.totalDecisions, 4);
  assert.deepStrictEqual(calls[3], ["dashboard", { workspace: "default", dataset: "demo", artifact: "all" }]);

  // Server-side reverification: a forged verified flag is recomputed from the transcript.
  const forged = fakeRes();
  await runsApi.createHandler(store)({ method: "POST", headers: {}, body: {
    idempotencyKey: "forged-1",
    transcript: "Ava: I will send the packet Friday.",
    analysis: { summary: "x", commitments: [{ id: "c1", owner: "Ava", action: "Approve the deal", sourceQuote: "We approved the deal.", verified: true, supported: true }], blockers: [], expansionSignals: [], followUp: {}, crm: {} }
  } }, forged);
  assert.strictEqual(forged.statusCode, 201);
  const forgedCall = calls[calls.length - 1][1];
  assert.strictEqual(forgedCall.analysis.commitments[0].verified, false, "client-supplied verified must never be trusted");
  assert.strictEqual(forgedCall.workspace, "default");

  // Workspaces: the key decides which workspace reads and writes.
  process.env.COPILOT_KEYS = "acme:key-a,globex:key-g";
  const scoped = fakeRes();
  await runsApi.createHandler(store)({ method: "DELETE", headers: { "x-copilot-key": "key-g" }, query: { id: "run-1" } }, scoped);
  assert.strictEqual(scoped.statusCode, 200);
  assert.deepStrictEqual(calls[calls.length - 1], ["delete", "run-1"]);
  const dash = fakeRes();
  await dashboardApi.createHandler(store)({ method: "GET", headers: { "x-copilot-key": "key-a" }, query: {} }, dash);
  assert.strictEqual(calls[calls.length - 1][1].workspace, "acme");
  const noKey = fakeRes();
  await dashboardApi.createHandler(store)({ method: "GET", headers: {}, query: {} }, noKey);
  assert.strictEqual(noKey.statusCode, 401);
  delete process.env.COPILOT_KEYS;

  console.log("eval-api.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
