function roundedAverage(values, multiplier) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length) * (multiplier || 1));
}

function rate(list, predicate) {
  if (!list.length) return 0;
  return Math.round((list.filter(predicate).length / list.length) * 100);
}

function latestEvaluations(events) {
  const latest = new Map();
  (events || []).forEach((event) => {
    if (!event || !event.run_id || !event.artifact_type) return;
    const key = event.run_id + ":" + event.artifact_type;
    const current = latest.get(key);
    if (!current || String(event.created_at || "") >= String(current.created_at || "")) latest.set(key, event);
  });
  return Array.from(latest.values());
}

function metricBlock(events) {
  const list = events || [];
  return {
    totalDecisions: list.length,
    approvalRate: rate(list, (event) => event.decision === "approved"),
    averageEditRate: roundedAverage(list.map((event) => event.edit_ratio), 100),
    averageDecisionSeconds: roundedAverage(list.map((event) => event.decision_seconds), 1),
    completedActionRate: rate(list, (event) => event.completed === true)
  };
}

function buildDashboard(input) {
  const runs = Array.isArray(input && input.runs) ? input.runs : [];
  const evaluations = latestEvaluations(Array.isArray(input && input.evaluations) ? input.evaluations : []);
  const evidence = Array.isArray(input && input.evidence) ? input.evidence : [];
  const summary = metricBlock(evaluations);
  summary.verifiedEvidenceRate = rate(evidence, (item) => item.verified === true);

  const reasonCounts = new Map();
  evaluations.filter((event) => event.decision === "rejected" && event.reason).forEach((event) => {
    reasonCounts.set(event.reason, (reasonCounts.get(event.reason) || 0) + 1);
  });
  const rejectionReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const withRuleEvents = evaluations.filter((event) => Array.isArray(event.applied_rule_ids) && event.applied_rule_ids.length);
  const withoutRuleEvents = evaluations.filter((event) => !Array.isArray(event.applied_rule_ids) || !event.applied_rule_ids.length);
  const byRun = new Map();
  evaluations.forEach((event) => {
    if (!byRun.has(event.run_id)) byRun.set(event.run_id, []);
    byRun.get(event.run_id).push(event);
  });
  const evidenceByRun = new Map();
  evidence.forEach((item) => {
    if (!evidenceByRun.has(item.run_id)) evidenceByRun.set(item.run_id, []);
    evidenceByRun.get(item.run_id).push(item);
  });

  const recentRuns = runs.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 20).map((run) => {
    const runEvents = byRun.get(run.id) || [];
    const runEvidence = evidenceByRun.get(run.id) || [];
    return {
      id: run.id,
      account: run.account_name || "Unknown account",
      scenario: run.scenario || "Conversation",
      datasetKind: run.dataset_kind || "live",
      createdAt: run.created_at,
      approvalRate: rate(runEvents, (event) => event.decision === "approved"),
      decisionCount: runEvents.length,
      verifiedEvidenceRate: rate(runEvidence, (item) => item.verified === true),
      trace: runEvidence.length ? {
        label: runEvidence[0].label || runEvidence[0].kind || "Source evidence",
        quote: runEvidence[0].source_quote || ""
      } : null
    };
  });

  return {
    summary,
    rejectionReasons,
    ruleImpact: { withRule: metricBlock(withRuleEvents), withoutRule: metricBlock(withoutRuleEvents) },
    recentRuns
  };
}

module.exports = { buildDashboard, latestEvaluations, metricBlock };
