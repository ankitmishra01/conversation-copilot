(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvalDashboard = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var EMPTY_SUMMARY = { totalDecisions: 0, approvalRate: 0, averageEditRate: 0, averageDecisionSeconds: 0, completedActionRate: 0, verifiedEvidenceRate: 0 };
  function formatPercent(value) { return Math.round(Number(value) || 0) + "%"; }
  function formatSeconds(value) { return Math.round(Number(value) || 0) + "s"; }
  function normalizeDashboard(value) {
    var input = value && typeof value === "object" ? value : {};
    return {
      summary: Object.assign({}, EMPTY_SUMMARY, input.summary || {}),
      rejectionReasons: Array.isArray(input.rejectionReasons) ? input.rejectionReasons : [],
      ruleImpact: input.ruleImpact || { withRule: {}, withoutRule: {} },
      recentRuns: Array.isArray(input.recentRuns) ? input.recentRuns : []
    };
  }

  function apiHeaders() {
    var headers = { "Content-Type": "application/json" };
    try {
      var key = root.localStorage.getItem("copilotKey");
      if (key) headers["x-copilot-key"] = key;
    } catch (error) { /* public demos do not require a key */ }
    return headers;
  }

  function init() {
    if (typeof document === "undefined") return;
    var panel = document.getElementById("view-evals");
    if (!panel) return;
    var el = function (id) { return document.getElementById(id); };
    function text(id, value) { if (el(id)) el(id).textContent = value; }

    function render(value) {
      var data = normalizeDashboard(value);
      var summary = data.summary;
      text("evalMetricDecisions", summary.totalDecisions);
      text("evalMetricApproval", formatPercent(summary.approvalRate));
      text("evalMetricEditing", formatPercent(summary.averageEditRate));
      text("evalMetricTime", formatSeconds(summary.averageDecisionSeconds));
      text("evalMetricCompleted", formatPercent(summary.completedActionRate));
      text("evalMetricEvidence", formatPercent(summary.verifiedEvidenceRate));
      text("evalWithoutRuleApproval", formatPercent(data.ruleImpact.withoutRule.approvalRate));
      text("evalWithoutRuleEditing", formatPercent(data.ruleImpact.withoutRule.averageEditRate) + " average editing");
      text("evalWithRuleApproval", formatPercent(data.ruleImpact.withRule.approvalRate));
      text("evalWithRuleEditing", formatPercent(data.ruleImpact.withRule.averageEditRate) + " average editing");

      var reasons = el("evalRejectionReasons");
      reasons.innerHTML = "";
      data.rejectionReasons.forEach(function (reason) {
        var item = document.createElement("li");
        var label = document.createElement("span"); label.textContent = reason.reason;
        var count = document.createElement("strong"); count.textContent = reason.count;
        item.append(label, count); reasons.appendChild(item);
      });
      if (!data.rejectionReasons.length) {
        var emptyReason = document.createElement("li"); emptyReason.className = "eval-empty"; emptyReason.textContent = "No rejection reasons in this filter."; reasons.appendChild(emptyReason);
      }

      var runs = el("evalRecentRuns");
      runs.innerHTML = "";
      data.recentRuns.forEach(function (run) {
        var row = document.createElement("article"); row.className = "eval-run-row";
        var identity = document.createElement("div");
        var title = document.createElement("h3"); title.textContent = run.account;
        var scenario = document.createElement("p"); scenario.textContent = run.scenario + " · " + (run.createdAt ? new Date(run.createdAt).toLocaleDateString() : "date not stated");
        identity.append(title, scenario);
        var dataset = document.createElement("span"); dataset.className = "dataset-label"; dataset.textContent = run.datasetKind + " data";
        function stat(labelText, value) {
          var block = document.createElement("div"); block.className = "eval-run-stat";
          var label = document.createElement("span"); label.textContent = labelText;
          var strong = document.createElement("strong"); strong.textContent = value;
          block.append(label, strong); return block;
        }
        row.append(identity, dataset, stat("Decisions", run.decisionCount), stat("Approval", formatPercent(run.approvalRate)), stat("Evidence", formatPercent(run.verifiedEvidenceRate)));
        if (run.trace && run.trace.quote) {
          var trace = document.createElement("div"); trace.className = "eval-run-trace";
          var traceLabel = document.createElement("strong"); traceLabel.textContent = run.trace.label;
          var quote = document.createElement("span"); quote.textContent = "“" + run.trace.quote + "”";
          trace.append(traceLabel, quote); row.appendChild(trace);
        }
        runs.appendChild(row);
      });
      if (!data.recentRuns.length) {
        var emptyRun = document.createElement("p"); emptyRun.className = "eval-empty"; emptyRun.textContent = "No saved runs match these filters."; runs.appendChild(emptyRun);
      }
    }

    function load() {
      var dataset = el("evalDatasetFilter").value;
      var artifact = el("evalArtifactFilter").value;
      text("evalDashboardStatus", "Loading evaluation history…");
      return fetch("/api/eval-dashboard?dataset=" + encodeURIComponent(dataset) + "&artifact=" + encodeURIComponent(artifact), { headers: apiHeaders(), cache: "no-store" })
        .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || "dashboard_unavailable");
          render(result.body);
          text("evalDashboardStatus", result.body.summary.totalDecisions + " durable decisions · filters applied");
        }).catch(function () {
          render(null);
          text("evalDashboardStatus", "Control Tower unavailable. Existing local evaluations are unchanged.");
        });
    }

    el("evalDatasetFilter").addEventListener("change", load);
    el("evalArtifactFilter").addEventListener("change", load);
    el("refreshEvalDashboard").addEventListener("click", load);
    root.addEventListener("productviewchange", function (event) { if (event.detail && event.detail.view === "evals") load(); });
    if (new URLSearchParams(root.location.search || "").get("view") === "evals") load();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return { formatPercent: formatPercent, formatSeconds: formatSeconds, normalizeDashboard: normalizeDashboard, init: init };
}));
