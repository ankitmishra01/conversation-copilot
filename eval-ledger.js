(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CommitmentEvals = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_KEY = "conversation-copilot:commitment-evals:v1";

  function words(value) {
    return String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || [];
  }

  function wordChangeRatio(original, final) {
    var before = words(original);
    var after = words(final);
    if (!before.length && !after.length) return 0;
    if (!before.length || !after.length) return 1;
    var previous = Array.from({ length: after.length + 1 }, function (_, index) { return index; });
    for (var i = 1; i <= before.length; i += 1) {
      var current = [i];
      for (var j = 1; j <= after.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (before[i - 1] === after[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return Math.round((previous[after.length] / Math.max(before.length, after.length)) * 100) / 100;
  }

  function iso(value, fallback) {
    var date = new Date(value || fallback || Date.now());
    if (Number.isNaN(date.getTime())) date = new Date(fallback || Date.now());
    return date.toISOString();
  }

  function createDecisionEvent(input) {
    input = input || {};
    if (["approved", "rejected"].indexOf(input.decision) === -1) throw new Error("decision must be approved or rejected");
    var reason = String(input.reason || "").trim();
    if (input.decision === "rejected" && !reason) throw new Error("rejection reason is required");
    var startedAt = iso(input.startedAt);
    var decidedAt = iso(input.decidedAt, startedAt);
    var original = String(input.original || "");
    var finalText = String(input.final == null ? original : input.final);
    var seconds = Math.max(0, Math.round((new Date(decidedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    var editRatio = wordChangeRatio(original, finalText);
    return {
      id: String(input.id || ("eval-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8))),
      runId: String(input.runId || "unknown-run"),
      artifactType: String(input.artifactType || "unknown"),
      decision: input.decision,
      original: original,
      final: finalText,
      reason: reason,
      edited: editRatio > 0,
      editRatio: editRatio,
      startedAt: startedAt,
      decidedAt: decidedAt,
      decisionSeconds: seconds,
      completed: input.completed === true
    };
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function calculateMetrics(events) {
    var list = Array.isArray(events) ? events.filter(function (event) {
      return event && ["approved", "rejected"].indexOf(event.decision) !== -1;
    }) : [];
    var approvals = list.filter(function (event) { return event.decision === "approved"; }).length;
    return {
      totalDecisions: list.length,
      approvalRate: list.length ? Math.round((approvals / list.length) * 100) : 0,
      averageEditRate: Math.round(average(list.map(function (event) { return Number(event.editRatio) || 0; })) * 100),
      averageDecisionSeconds: Math.round(average(list.map(function (event) { return Number(event.decisionSeconds) || 0; }))),
      completedActions: list.filter(function (event) { return event.completed === true; }).length
    };
  }

  function createLedger(storage, key) {
    var target = storage;
    var storageKey = key || DEFAULT_KEY;
    if (!target || typeof target.getItem !== "function") throw new Error("storage with getItem/setItem/removeItem is required");

    function list() {
      try {
        var parsed = JSON.parse(target.getItem(storageKey) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }

    function write(events) {
      target.setItem(storageKey, JSON.stringify(events));
      return events;
    }

    return {
      list: list,
      add: function (event) {
        var events = list().filter(function (existing) {
          return !(existing.runId === event.runId && existing.artifactType === event.artifactType);
        });
        events.push(event);
        write(events.slice(-200));
        return event;
      },
      clear: function () { target.removeItem(storageKey); },
      exportJson: function () { return JSON.stringify(list(), null, 2); }
    };
  }

  return {
    DEFAULT_KEY: DEFAULT_KEY,
    wordChangeRatio: wordChangeRatio,
    createDecisionEvent: createDecisionEvent,
    calculateMetrics: calculateMetrics,
    createLedger: createLedger
  };
}));
