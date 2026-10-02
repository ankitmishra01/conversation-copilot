(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CommitmentLoop = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function artifactText(type, analysis) {
    analysis = analysis || {};
    if (type === "follow-up") {
      var followUp = analysis.followUp || {};
      return "Subject: " + String(followUp.subject || "") + "\n\n" + String(followUp.body || "");
    }
    var crm = analysis.crm || {};
    return [
      String(crm.summary || ""),
      "Next step: " + String(crm.nextStep || "Unassigned"),
      "Next-step date: " + String(crm.nextStepDate || "Not stated"),
      "Stage suggestion: " + String(crm.stageSuggestion || "No change suggested")
    ].join("\n\n");
  }

  function sandboxRecord(type, content, completedAt) {
    return {
      kind: type === "follow-up" ? "outbox" : "account-record",
      label: type === "follow-up" ? "Email queued in demo outbox" : "CRM note written to demo account",
      content: String(content || ""),
      completedAt: completedAt || new Date().toISOString()
    };
  }

  function prepareDemoAnalysis(analysis) {
    var copy = JSON.parse(JSON.stringify(analysis || {}));
    ["commitments", "blockers", "expansionSignals"].forEach(function (key) {
      copy[key] = (copy[key] || []).map(function (item) { item.verified = true; return item; });
    });
    copy.warnings = [];
    copy.model = "Bundled verified snapshot";
    copy.generatedAt = new Date().toISOString();
    return copy;
  }

  function init() {
    var section = document.getElementById("closeLoop");
    if (!section || !root.CommitmentEvals) return;
    var el = function (id) { return document.getElementById(id); };
    var transcript = el("loopTranscript");
    var status = el("loopStatus");
    var results = el("loopResults");
    var summary = el("loopSummary");
    var evidence = el("evidenceRail");
    var warnings = el("loopWarnings");
    var model = el("loopModel");
    var ledger = root.CommitmentEvals.createLedger(root.localStorage);
    var currentAnalysis = null;
    var currentRunId = null;
    var currentStartedAt = null;
    var demoData = null;

    function setStatus(message, tone) {
      status.textContent = message;
      status.dataset.tone = tone || "idle";
    }

    function apiHeaders() {
      var headers = { "Content-Type": "application/json" };
      try {
        var key = root.localStorage.getItem("copilotKey");
        if (key) headers["x-copilot-key"] = key;
      } catch (error) { /* public demos do not require a key */ }
      return headers;
    }

    function evidenceCard(item, kind) {
      var article = document.createElement("article");
      article.className = "evidence-card" + (item.verified ? " is-verified" : " is-unsupported");
      var marker = document.createElement("span");
      marker.className = "evidence-marker";
      marker.textContent = item.verified ? "SOURCE MATCH" : "UNSUPPORTED";
      var title = document.createElement("h4");
      title.textContent = kind === "commitment" ? (item.owner + " · " + item.action) : item.label;
      var meta = document.createElement("p");
      meta.className = "evidence-meta";
      meta.textContent = kind === "commitment" ? [item.party, item.dueDate || "No date stated"].join(" · ") : kind;
      var quote = document.createElement("blockquote");
      quote.textContent = item.sourceQuote ? "“" + item.sourceQuote + "”" : "No source quote returned.";
      article.append(marker, title, meta, quote);
      return article;
    }

    function renderEvidence(analysis) {
      evidence.innerHTML = "";
      var groups = [
        ["commitment", analysis.commitments || []],
        ["blocker", analysis.blockers || []],
        ["expansion signal", analysis.expansionSignals || []]
      ];
      groups.forEach(function (group) {
        group[1].forEach(function (item) { evidence.appendChild(evidenceCard(item, group[0])); });
      });
      if (!evidence.children.length) {
        var empty = document.createElement("p");
        empty.className = "loop-empty";
        empty.textContent = "No source-backed commitments, blockers, or expansion signals were found.";
        evidence.appendChild(empty);
      }
    }

    function renderWarnings(items) {
      warnings.innerHTML = "";
      warnings.hidden = !items || !items.length;
      (items || []).forEach(function (message) {
        var li = document.createElement("li");
        li.textContent = message;
        warnings.appendChild(li);
      });
    }

    function renderAnalysis(analysis, label) {
      currentAnalysis = analysis;
      currentRunId = "run-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      currentStartedAt = new Date().toISOString();
      summary.textContent = analysis.summary;
      el("followupEditor").value = artifactText("follow-up", analysis);
      el("crmEditor").value = artifactText("crm", analysis);
      ["follow-up", "crm"].forEach(function (type) {
        el(type === "follow-up" ? "followupDecision" : "crmDecision").textContent = "Awaiting review";
        el(type === "follow-up" ? "followupReason" : "crmReason").value = "";
      });
      model.textContent = label || analysis.model || "Model response";
      renderEvidence(analysis);
      renderWarnings(analysis.warnings);
      results.hidden = false;
      setStatus("Analysis ready for human review.", "ready");
      renderMetrics();
    }

    function renderMetrics() {
      var events = ledger.list();
      var metrics = root.CommitmentEvals.calculateMetrics(events);
      el("metricDecisions").textContent = metrics.totalDecisions;
      el("metricApproval").textContent = metrics.approvalRate + "%";
      el("metricEditing").textContent = metrics.averageEditRate + "%";
      el("metricTime").textContent = metrics.averageDecisionSeconds + "s";
      el("metricCompleted").textContent = metrics.completedActions;
      var list = el("decisionLedger");
      list.innerHTML = "";
      events.slice().reverse().slice(0, 8).forEach(function (event) {
        var item = document.createElement("li");
        item.innerHTML = "<strong></strong><span></span>";
        item.querySelector("strong").textContent = event.artifactType === "follow-up" ? "Follow-up email" : "CRM update";
        item.querySelector("span").textContent = event.decision + (event.edited ? " · edited " + Math.round(event.editRatio * 100) + "%" : " · no edits") + " · " + event.decisionSeconds + "s";
        list.appendChild(item);
      });
      el("ledgerEmpty").hidden = events.length > 0;
      renderSandbox(events);
    }

    function renderSandbox(events) {
      var out = el("sandboxActions");
      out.innerHTML = "";
      events.filter(function (event) { return event.completed; }).slice().reverse().slice(0, 6).forEach(function (event) {
        var record = sandboxRecord(event.artifactType, event.final, event.decidedAt);
        var article = document.createElement("article");
        article.className = "sandbox-record";
        var label = document.createElement("strong");
        label.textContent = record.label;
        var time = document.createElement("time");
        time.dateTime = record.completedAt;
        time.textContent = new Date(record.completedAt).toLocaleString();
        var body = document.createElement("p");
        body.textContent = record.content;
        article.append(label, time, body);
        out.appendChild(article);
      });
      el("sandboxEmpty").hidden = out.children.length > 0;
    }

    function decide(type, decision) {
      if (!currentAnalysis) return;
      var prefix = type === "follow-up" ? "followup" : "crm";
      var reason = el(prefix + "Reason").value.trim();
      if (decision === "rejected" && !reason) {
        setStatus("Choose a rejection reason so the eval is useful.", "error");
        el(prefix + "Reason").focus();
        return;
      }
      var original = artifactText(type, currentAnalysis);
      var finalText = el(prefix + "Editor").value;
      var event = root.CommitmentEvals.createDecisionEvent({
        runId: currentRunId,
        artifactType: type,
        decision: decision,
        original: original,
        final: finalText,
        reason: reason,
        startedAt: currentStartedAt,
        decidedAt: new Date().toISOString(),
        completed: decision === "approved"
      });
      ledger.add(event);
      el(prefix + "Decision").textContent = decision === "approved" ? (event.edited ? "Approved with edits" : "Approved unchanged") : "Rejected · learning captured";
      setStatus(decision === "approved" ? "Action completed in the demo sandbox." : "Rejection captured for the learning loop.", decision === "approved" ? "complete" : "ready");
      renderMetrics();
    }

    function loadDemo(shouldScroll) {
      return fetch("/data/commitment-loop-demo.json", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("demo_unavailable");
        return response.json();
      }).then(function (data) {
        demoData = data;
        transcript.value = data.transcript;
        renderAnalysis(prepareDemoAnalysis(data.analysis), "Verified demo snapshot · " + data.account);
        if (shouldScroll !== false) section.scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function () {
        setStatus("The bundled demo could not be loaded.", "error");
      });
    }

    function analyze() {
      var text = transcript.value.trim();
      if (!text) {
        setStatus("Add a transcript or load the verified demo first.", "error");
        transcript.focus();
        return;
      }
      setStatus("Tracing commitments and drafting the workflow…", "working");
      el("analyzeLoop").disabled = true;
      fetch("/api/close-loop", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ transcript: text, scenario: "B2B renewal, retention, and expansion follow-up" })
      }).then(function (response) {
        return response.json().then(function (body) { return { ok: response.ok, body: body }; });
      }).then(function (result) {
        if (!result.ok) throw new Error(result.body.error || "analysis_failed");
        renderAnalysis(result.body, result.body.model);
      }).catch(function (error) {
        if (demoData && text === demoData.transcript) {
          renderAnalysis(prepareDemoAnalysis(demoData.analysis), "Verified demo snapshot · live model unavailable");
          setStatus("Live analysis was unavailable; showing the verified bundled snapshot.", "ready");
          return;
        }
        setStatus("Analysis failed: " + String(error.message || error) + ". Your transcript remains in this browser.", "error");
      }).finally(function () { el("analyzeLoop").disabled = false; });
    }

    el("useLiveTranscript").addEventListener("click", function () {
      transcript.value = (document.getElementById("transcript") || {}).value || "";
      setStatus(transcript.value.trim() ? "Live transcript copied. Ready to analyze." : "The live transcript is empty.", transcript.value.trim() ? "ready" : "error");
    });
    el("loadLoopDemo").addEventListener("click", function () { loadDemo(true); });
    el("analyzeLoop").addEventListener("click", analyze);
    el("approveFollowup").addEventListener("click", function () { decide("follow-up", "approved"); });
    el("rejectFollowup").addEventListener("click", function () { decide("follow-up", "rejected"); });
    el("approveCrm").addEventListener("click", function () { decide("crm", "approved"); });
    el("rejectCrm").addEventListener("click", function () { decide("crm", "rejected"); });
    el("exportLedger").addEventListener("click", function () {
      var blob = new Blob([ledger.exportJson()], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "conversation-copilot-evals.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Evaluation ledger exported.", "complete");
    });
    el("clearLedger").addEventListener("click", function () {
      ledger.clear();
      renderMetrics();
      setStatus("Local evaluation ledger cleared.", "idle");
    });

    renderMetrics();
    if (new URLSearchParams(root.location.search || "").get("demo") === "commitment-loop") {
      document.body.classList.add("concept-mode");
      loadDemo(false);
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    artifactText: artifactText,
    sandboxRecord: sandboxRecord,
    prepareDemoAnalysis: prepareDemoAnalysis,
    init: init
  };
}));
