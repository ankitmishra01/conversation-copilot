// test/eval-ledger.test.js
const assert = require("assert");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function run() {
  const evals = require("../eval-ledger");

  assert.strictEqual(evals.wordChangeRatio("Send packet Friday", "Send packet Friday"), 0, "identical drafts need no editing");
  assert.strictEqual(evals.wordChangeRatio("Send packet Friday", "Send security packet Friday"), 0.25, "one inserted word in four must equal a 25% edit ratio");
  assert.strictEqual(evals.wordChangeRatio("", "New draft"), 1, "a wholly new draft must equal a 100% edit ratio");

  const approved = evals.createDecisionEvent({
    runId: "run-1",
    artifactType: "follow-up",
    decision: "approved",
    original: "Send packet Friday",
    final: "Send security packet Friday",
    reason: "",
    startedAt: "2026-10-01T12:00:00.000Z",
    decidedAt: "2026-10-01T12:00:20.000Z",
    completed: true
  });
  assert.strictEqual(approved.edited, true);
  assert.strictEqual(approved.editRatio, 0.25);
  assert.strictEqual(approved.decisionSeconds, 20);

  assert.throws(() => evals.createDecisionEvent({ decision: "ignored" }), /decision/, "unknown decisions must be rejected");
  assert.throws(() => evals.createDecisionEvent({ decision: "rejected", reason: "" }), /reason/, "a rejection without a reason is not useful eval data");

  const rejected = evals.createDecisionEvent({
    runId: "run-1",
    artifactType: "crm",
    decision: "rejected",
    original: "Move to contracting",
    final: "Move to contracting",
    reason: "The buyer did not agree to this stage.",
    startedAt: "2026-10-01T12:00:00.000Z",
    decidedAt: "2026-10-01T12:00:40.000Z",
    completed: false
  });
  const metrics = evals.calculateMetrics([approved, rejected]);
  assert.deepStrictEqual(metrics, {
    totalDecisions: 2,
    approvalRate: 50,
    averageEditRate: 13,
    averageDecisionSeconds: 30,
    completedActions: 1
  });

  const storage = memoryStorage();
  const ledgerA = evals.createLedger(storage, "test-ledger");
  ledgerA.add(approved);
  ledgerA.add(rejected);
  const ledgerB = evals.createLedger(storage, "test-ledger");
  assert.strictEqual(ledgerB.list().length, 2, "events must survive a new ledger instance");
  const revisedApproval = Object.assign({}, approved, { id: "replacement", final: "Final approved copy", editRatio: 1 });
  ledgerB.add(revisedApproval);
  assert.strictEqual(ledgerB.list().length, 2, "a repeated decision for the same run and artifact must replace, not double-count");
  assert.strictEqual(ledgerB.list().find((event) => event.artifactType === "follow-up").id, "replacement");
  assert.ok(ledgerB.exportJson().includes('"decision": "approved"'), "export must contain readable decision data");
  ledgerB.clear();
  assert.deepStrictEqual(ledgerA.list(), [], "clear must remove the persisted ledger");

  storage.setItem("broken-ledger", "not json");
  assert.deepStrictEqual(evals.createLedger(storage, "broken-ledger").list(), [], "corrupt local data must fail closed");

  console.log("eval-ledger.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
