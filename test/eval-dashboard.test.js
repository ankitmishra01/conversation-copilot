const assert = require("assert");

function run() {
  const analytics = require("../api/_eval-analytics");
  const dashboard = require("../eval-dashboard");
  const data = analytics.buildDashboard({
    runs: [
      { id: "r1", account_name: "Northstar", scenario: "Renewal", dataset_kind: "demo", created_at: "2026-10-01T12:00:00Z" },
      { id: "r2", account_name: "Juniper", scenario: "Renewal", dataset_kind: "demo", created_at: "2026-10-02T12:00:00Z" }
    ],
    evaluations: [
      { id: "e1", run_id: "r1", artifact_type: "follow-up", decision: "approved", edit_ratio: 0.25, decision_seconds: 20, completed: true, reason: null, created_at: "2026-10-01T12:01:00Z" },
      { id: "e2", run_id: "r1", artifact_type: "crm", decision: "rejected", edit_ratio: 0, decision_seconds: 40, completed: false, reason: "Wrong owner", created_at: "2026-10-01T12:02:00Z" },
      { id: "e3", run_id: "r2", artifact_type: "follow-up", decision: "approved", edit_ratio: 0, decision_seconds: 10, completed: true, reason: null, created_at: "2026-10-02T12:01:00Z", applied_rule_ids: ["renewal-focus"] }
    ],
    evidence: [
      { run_id: "r1", verified: true }, { run_id: "r1", verified: false }, { run_id: "r2", verified: true }
    ]
  });

  assert.deepStrictEqual(data.summary, {
    totalDecisions: 3,
    approvalRate: 67,
    averageEditRate: 8,
    averageDecisionSeconds: 23,
    completedActionRate: 67,
    verifiedEvidenceRate: 67
  });
  assert.deepStrictEqual(data.rejectionReasons, [{ reason: "Wrong owner", count: 1 }]);
  assert.strictEqual(data.ruleImpact.withRule.approvalRate, 100);
  assert.strictEqual(data.ruleImpact.withoutRule.approvalRate, 50);
  assert.strictEqual(data.recentRuns[0].account, "Juniper");
  assert.strictEqual(dashboard.formatPercent(67), "67%");
  assert.strictEqual(dashboard.formatSeconds(23), "23s");
  assert.deepStrictEqual(dashboard.normalizeDashboard(null).summary, {
    totalDecisions: 0, approvalRate: 0, averageEditRate: 0, averageDecisionSeconds: 0, completedActionRate: 0, verifiedEvidenceRate: 0
  });

  console.log("eval-dashboard.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
