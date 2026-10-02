(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CommitmentLoop = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function sourceMatch(transcript, quote) {
    var haystack = String(transcript || "");
    var needle = String(quote || "").trim();
    if (!needle) return null;
    var pattern = needle.split(/\s+/).map(function (part) {
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("\\s+");
    var match = new RegExp(pattern, "i").exec(haystack);
    if (!match) return null;
    return { start: match.index, end: match.index + match[0].length, quote: match[0] };
  }

  function filterEvidence(analysis, filter) {
    analysis = analysis || {};
    var groups = [
      ["commitment", analysis.commitments || []],
      ["blocker", analysis.blockers || []],
      ["expansion", analysis.expansionSignals || []]
    ];
    return groups.reduce(function (items, group) {
      if (filter && filter !== "all" && filter !== group[0]) return items;
      return items.concat(group[1].map(function (item) {
        return Object.assign({}, item, { kind: group[0] });
      }));
    }, []);
  }

  function feedbackState(events) {
    var list = Array.isArray(events) ? events : [];
    var completedTypes = list.filter(function (event) {
      return event && event.decision === "approved" && event.completed;
    }).map(function (event) {
      return event.artifactType || "legacy-" + list.indexOf(event);
    }).filter(function (type, index, types) {
      return types.indexOf(type) === index;
    });
    var completed = completedTypes.length;
    var rejected = list.filter(function (event) { return event && event.decision === "rejected"; }).length;
    var decidedTypes = list.map(function (event) {
      return event && event.artifactType ? event.artifactType : "legacy-" + list.indexOf(event);
    }).filter(function (type, index, types) {
      return types.indexOf(type) === index;
    });
    return {
      stage: completed >= 2 && rejected === 0 ? "attribution" : list.length ? "evaluation" : "context",
      pending: Math.max(0, 2 - decidedTypes.length),
      completed: completed,
      rejected: rejected
    };
  }

  function compareArtifact(before, after) {
    function lines(value) {
      return String(value || "").split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
    }
    var beforeLines = lines(before);
    var afterLines = lines(after);
    return {
      removed: beforeLines.filter(function (line) { return afterLines.indexOf(line) === -1; }),
      added: afterLines.filter(function (line) { return beforeLines.indexOf(line) === -1; })
    };
  }

  function createLearnedRule(definition, decision) {
    var rule = definition || {};
    var event = decision || {};
    return {
      id: String(rule.id || "learned-rule"),
      label: String(rule.label || "Human feedback rule"),
      instruction: String(rule.instruction || ""),
      appliesTo: Array.isArray(rule.appliesTo) ? rule.appliesTo.slice() : [],
      excludedFrom: Array.isArray(rule.excludedFrom) ? rule.excludedFrom.slice() : [],
      sourceRunId: String(event.runId || "unknown-run"),
      sourceArtifactType: String(event.artifactType || "unknown"),
      sourceDecision: String(event.decision || "unknown"),
      humanEdited: event.edited === true
    };
  }

  var PRESENTATION_STEPS = [
    { title: "Start with account context", action: "Inspect source", stage: "context" },
    { title: "Trace the claim to the call", action: "Apply human edit", stage: "context" },
    { title: "Correct the customer-facing action", action: "Approve corrected work", stage: "evaluation" },
    { title: "Record the human decision", action: "Show learned rule", stage: "evaluation" },
    { title: "Turn the edit into reusable guidance", action: "Review rule", stage: "evaluation" },
    { title: "Carry feedback into the next run", action: "Run next conversation", stage: "agent" },
    { title: "See exactly what changed", action: "Reveal associated outcome", stage: "agent" },
    { title: "Connect action to an observed result", action: "Restart presentation", stage: "attribution" }
  ];

  function presentationStep(index) {
    var bounded = Math.max(0, Math.min(PRESENTATION_STEPS.length - 1, Number(index) || 0));
    return Object.assign({ index: bounded, total: PRESENTATION_STEPS.length }, PRESENTATION_STEPS[bounded]);
  }

  function presentationVisibility(index) {
    var step = presentationStep(index).index;
    return {
      replay: step >= 4,
      rule: step >= 4,
      nextRun: step >= 6,
      outcome: step >= 7
    };
  }

  function qualifiesForDemoRule(correction, original, finalText, event, verifiedDemo) {
    var removal = String(correction && correction.remove || "");
    return verifiedDemo === true && event && event.decision === "approved" && event.edited === true &&
      removal.length > 0 && String(original || "").indexOf(removal) !== -1 && String(finalText || "").indexOf(removal) === -1;
  }

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
    var activeFilter = "all";
    var analyzedTranscript = "";
    var guidedStep = 0;
    var learnedRule = null;
    var presentationActive = false;
    var isVerifiedDemoRun = false;

    function setStatus(message, tone) {
      status.textContent = message;
      status.dataset.tone = tone || "idle";
    }

    function populateLearningReplay() {
      if (!demoData || !demoData.learningLoop || !learnedRule) return false;
      var loop = demoData.learningLoop;
      var rule = learnedRule;
      el("learningRuleTitle").textContent = rule.label;
      el("learningRuleText").textContent = rule.instruction;
      el("ruleAppliesTo").textContent = rule.appliesTo.join(", ");
      el("ruleExcludedFrom").textContent = rule.excludedFrom.join(", ");
      el("humanRemovedText").textContent = loop.edit.remove;
      el("nextRunTitle").textContent = loop.nextRun.account + " renewal checkpoint";
      el("nextRunMeta").textContent = loop.nextRun.scenario;
      el("baselineSubject").textContent = loop.nextRun.baselineFollowUp.subject;
      el("baselineBody").textContent = loop.nextRun.baselineFollowUp.body;
      el("learnedSubject").textContent = loop.nextRun.learnedFollowUp.subject;
      el("learnedBody").textContent = loop.nextRun.learnedFollowUp.body;
      el("appliedRuleLabel").textContent = "Applied rule · " + rule.label;
      el("nextRunCrm").textContent = loop.nextRun.crmNote;
      el("outcomeTitle").textContent = loop.outcome.title;
      el("outcomeSummary").textContent = loop.outcome.summary;
      var timeline = el("outcomeTimeline");
      timeline.innerHTML = "";
      loop.outcome.events.forEach(function (event) {
        var item = document.createElement("li");
        item.innerHTML = "<time></time><div><strong></strong><span></span></div>";
        item.querySelector("time").textContent = event.time;
        item.querySelector("strong").textContent = event.label;
        item.querySelector("span").textContent = event.detail;
        timeline.appendChild(item);
      });
      return true;
    }

    function applyDemoEdit() {
      if (!demoData || !demoData.learningLoop) return false;
      var editor = el("followupEditor");
      var removal = demoData.learningLoop.edit.remove;
      if (editor.value.indexOf(removal) === -1) {
        setStatus("The expected demo sentence is not present. Replay the verified demo before applying this edit.", "error");
        return false;
      }
      editor.value = editor.value.replace(removal, "").replace(/\n{3,}/g, "\n\n").trim();
      setStatus("Human edit applied. The renewal email now stays focused on the immediate blocker.", "working");
      editor.focus({ preventScroll: true });
      return true;
    }

    function renderPresentationStep() {
      var step = presentationStep(guidedStep);
      el("presentationGuide").hidden = false;
      el("presentationCounter").textContent = (step.index + 1) + " / " + step.total;
      el("presentationTitle").textContent = step.title;
      el("presentationNext").textContent = step.action;
      el("presentationBack").disabled = step.index === 0;
      el("presentationProgress").style.width = (((step.index + 1) / step.total) * 100) + "%";
      var copy = [
        "Follow one customer fact through action, evaluation, the next agent run, and an associated outcome.",
        "The claim resolves to the exact words in the call before any action is trusted.",
        "A human removes expansion language from a renewal-critical customer email.",
        "The approved edit and unchanged CRM record become structured evaluation data.",
        "The feedback is scoped: change the customer email, but keep the expansion signal in CRM.",
        "A second fictional conversation tests whether the same mistake happens again.",
        "The verified replay shows the baseline beside the feedback-informed draft.",
        "The action is linked to what happened next without claiming it caused the outcome."
      ];
      el("presentationCopy").textContent = copy[step.index];
      el("presentationAnnouncement").textContent = "Step " + (step.index + 1) + " of " + step.total + ": " + step.title + ". " + copy[step.index];
      var visibility = presentationVisibility(step.index);
      el("learningReplay").hidden = !visibility.replay;
      el("learningRulePanel").hidden = !visibility.rule;
      el("nextRunPanel").hidden = !visibility.nextRun;
      el("outcomePanel").hidden = !visibility.outcome;
    }

    function revealLearningPanel(panelId) {
      if (!populateLearningReplay()) return false;
      var panel = el(panelId);
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      panel.focus({ preventScroll: true });
      return true;
    }

    function exitPresentation() {
      presentationActive = false;
      guidedStep = 0;
      learnedRule = null;
      el("presentationGuide").hidden = true;
      el("learningReplay").hidden = true;
      ["learningRulePanel", "nextRunPanel", "outcomePanel"].forEach(function (id) { el(id).hidden = true; });
    }

    function advancePresentation() {
      if (!presentationActive) return;
      if (guidedStep === 0) {
        var first = filterEvidence(currentAnalysis, "all")[0];
        if (first) showSource(first);
      } else if (guidedStep === 1) {
        if (!applyDemoEdit()) return;
      } else if (guidedStep === 2) {
        var original = artifactText("follow-up", currentAnalysis);
        var finalDraft = el("followupEditor").value;
        var candidate = { decision: "approved", edited: root.CommitmentEvals.wordChangeRatio(original, finalDraft) > 0 };
        if (!qualifiesForDemoRule(demoData && demoData.learningLoop && demoData.learningLoop.edit, original, finalDraft, candidate, isVerifiedDemoRun)) {
          setStatus("The guided replay needs the verified human correction before approval.", "error");
          return;
        }
        decide("follow-up", "approved", "guided-replay");
        decide("crm", "approved", "guided-replay");
      } else if (guidedStep === 3) {
        revealLearningPanel("learningRulePanel");
      } else if (guidedStep === 4) {
        revealLearningPanel("learningRulePanel");
      } else if (guidedStep === 5) {
        revealLearningPanel("nextRunPanel");
      } else if (guidedStep === 6) {
        revealLearningPanel("outcomePanel");
      } else {
        startPresentation();
        return;
      }
      guidedStep += 1;
      renderPresentationStep();
    }

    function startPresentation() {
      presentationActive = true;
      guidedStep = 0;
      learnedRule = null;
      ["learningRulePanel", "nextRunPanel", "outcomePanel"].forEach(function (id) { el(id).hidden = true; });
      el("learningReplay").hidden = true;
      loadDemo(false, true).then(function () {
        renderPresentationStep();
        el("presentationGuide").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    function apiHeaders() {
      var headers = { "Content-Type": "application/json" };
      try {
        var key = root.localStorage.getItem("copilotKey");
        if (key) headers["x-copilot-key"] = key;
      } catch (error) { /* public demos do not require a key */ }
      return headers;
    }

    function showSource(item) {
      var preview = el("sourcePreview");
      if (!preview) return;
      var match = sourceMatch(analyzedTranscript, item.sourceQuote);
      preview.innerHTML = "";
      if (!match) {
        var missing = document.createElement("p");
        missing.textContent = "This claim does not have an exact source match in the current transcript.";
        preview.appendChild(missing);
      } else {
        var lead = document.createElement("p");
        var contextStart = Math.max(0, match.start - 90);
        var contextEnd = Math.min(analyzedTranscript.length, match.end + 90);
        lead.appendChild(document.createTextNode((contextStart ? "…" : "") + analyzedTranscript.slice(contextStart, match.start)));
        var mark = document.createElement("mark");
        mark.textContent = match.quote;
        lead.appendChild(mark);
        lead.appendChild(document.createTextNode(analyzedTranscript.slice(match.end, contextEnd) + (contextEnd < analyzedTranscript.length ? "…" : "")));
        preview.appendChild(lead);
      }
      preview.focus({ preventScroll: true });
    }

    function evidenceCard(item, index) {
      var article = document.createElement("button");
      article.type = "button";
      article.className = "evidence-card" + (item.verified ? " is-verified" : " is-unsupported");
      article.setAttribute("aria-label", "Show source for " + (item.kind === "commitment" ? item.action : item.label));
      var number = document.createElement("span");
      number.className = "evidence-number";
      number.textContent = String(index + 1);
      var marker = document.createElement("span");
      marker.className = "evidence-marker";
      marker.textContent = item.verified ? "Source verified" : "Unsupported";
      var title = document.createElement("h4");
      title.textContent = item.kind === "commitment" ? item.action : item.label;
      var meta = document.createElement("p");
      meta.className = "evidence-meta";
      meta.textContent = [item.sourceSpeaker, item.sourceDate, item.sourceType].filter(Boolean).join(" · ");
      var quote = document.createElement("blockquote");
      quote.textContent = item.sourceQuote ? "“" + item.sourceQuote + "”" : "No source quote returned.";
      article.append(number, title, marker, meta, quote);
      article.addEventListener("click", function () { showSource(item); });
      return article;
    }

    function renderEvidence(analysis, filter) {
      evidence.innerHTML = "";
      var items = filterEvidence(analysis, filter || "all");
      items.forEach(function (item, index) { evidence.appendChild(evidenceCard(item, index)); });
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

    function updateRunLabels(analysis, runMeta) {
      var commitments = (analysis.commitments || []).length;
      var blockers = (analysis.blockers || []).length;
      var expansion = (analysis.expansionSignals || []).length;
      var total = commitments + blockers + expansion;
      var meta = runMeta || {};
      el("conceptFindingCount").textContent = total;
      el("evidenceCount").textContent = total;
      el("filterAllCount").textContent = total;
      el("filterCommitmentCount").textContent = commitments;
      el("filterBlockerCount").textContent = blockers;
      el("filterExpansionCount").textContent = expansion;
      el("conceptRunLabel").textContent = meta.verified ? "● Verified demo" : "● Current analysis";
      el("conceptAccountLabel").textContent = meta.account ? (meta.verified ? "Fictional " : "") + meta.account : "Current customer conversation";
      el("loopAccountEyebrow").textContent = meta.account ? "ACCOUNT / " + meta.account.toUpperCase() : "ACCOUNT / CURRENT CONVERSATION";
      el("loopAccountName").textContent = meta.scenario || "Customer conversation review";
      el("loopRunMeta").textContent = meta.verified ? "Verified snapshot · fictional data · browser-local decisions" : "Live analysis · browser-local decisions";
    }

    function renderAnalysis(analysis, label, runMeta) {
      isVerifiedDemoRun = Boolean(runMeta && runMeta.verified);
      currentAnalysis = analysis;
      currentRunId = "run-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      currentStartedAt = new Date().toISOString();
      analyzedTranscript = transcript.value;
      section.classList.remove("has-stale-input");
      summary.textContent = analysis.summary;
      el("followupEditor").value = artifactText("follow-up", analysis);
      el("crmEditor").value = artifactText("crm", analysis);
      ["follow-up", "crm"].forEach(function (type) {
        var decisionEl = el(type === "follow-up" ? "followupDecision" : "crmDecision");
        decisionEl.textContent = "Awaiting review";
        delete decisionEl.dataset.tone;
        el(type === "follow-up" ? "followupReason" : "crmReason").value = "";
      });
      model.textContent = label || analysis.model || "Model response";
      updateRunLabels(analysis, runMeta);
      var sourcePreview = el("sourcePreview");
      sourcePreview.innerHTML = "<p>Select a finding to reveal its exact source passage.</p>";
      activeFilter = "all";
      Array.prototype.slice.call(document.querySelectorAll("[data-evidence-filter]")).forEach(function (button) {
        button.setAttribute("aria-pressed", button.dataset.evidenceFilter === "all" ? "true" : "false");
      });
      renderEvidence(analysis, activeFilter);
      renderWarnings(analysis.warnings);
      if (results) results.hidden = false;
      setStatus("Analysis ready for human review.", "ready");
      renderMetrics();
      renderFeedbackProgress();
    }

    function renderFeedbackProgress() {
      var currentEvents = ledger.list().filter(function (event) { return event.runId === currentRunId; });
      var progress = feedbackState(currentEvents);
      if (currentAnalysis && !currentEvents.length) progress.stage = "agent";
      var order = ["context", "agent", "evaluation", "attribution"];
      var currentIndex = order.indexOf(progress.stage);
      Array.prototype.slice.call(document.querySelectorAll("#contextTrace [data-stage]")).forEach(function (step, index) {
        step.classList.toggle("is-current", index === currentIndex);
        step.classList.toggle("is-complete", index < currentIndex || progress.stage === "attribution");
      });
      var pending = el("pendingCount");
      if (pending) pending.textContent = progress.pending ? progress.pending + " pending" : "Review complete";
      var conceptPending = el("conceptPendingCount");
      if (conceptPending) conceptPending.textContent = progress.pending;
      var attribution = el("attributionPanel");
      var attributionTitle = el("attributionTitle");
      var attributionCopy = el("attributionCopy");
      if (attribution) attribution.classList.toggle("is-complete", progress.stage === "attribution");
      if (attributionTitle) attributionTitle.textContent = progress.stage === "attribution" ? "Renewal workflow updated" : "Outcome waiting on action";
      if (attributionCopy) attributionCopy.textContent = progress.stage === "attribution"
        ? "The approved email and CRM write are now tied to this run. The next outcome can be attributed back to the decisions that produced it."
        : progress.rejected
          ? "A rejection is now structured evaluation data. Revise the action before attributing an outcome."
          : "Complete both actions to connect this agent run to the renewal workflow.";
    }

    function renderMetrics() {
      var events = ledger.list();
      var visibleEvents = currentRunId ? root.CommitmentEvals.eventsForRun(events, currentRunId) : events;
      var metrics = root.CommitmentEvals.calculateMetrics(visibleEvents);
      el("metricDecisions").textContent = metrics.totalDecisions;
      el("metricApproval").textContent = metrics.approvalRate + "%";
      el("metricEditing").textContent = metrics.averageEditRate + "%";
      el("metricTime").textContent = metrics.averageDecisionSeconds + "s";
      el("metricCompleted").textContent = metrics.completedActions;
      var list = el("decisionLedger");
      list.innerHTML = "";
      visibleEvents.slice().reverse().slice(0, 8).forEach(function (event) {
        var item = document.createElement("li");
        item.innerHTML = "<strong></strong><span></span>";
        item.querySelector("strong").textContent = event.artifactType === "follow-up" ? "Follow-up email" : "CRM update";
        item.querySelector("span").textContent = event.decision + (event.edited ? " · edited " + Math.round(event.editRatio * 100) + "%" : " · no edits") + " · " + event.decisionSeconds + "s";
        list.appendChild(item);
      });
      el("ledgerEmpty").hidden = visibleEvents.length > 0;
      renderSandbox(visibleEvents);
      renderFeedbackProgress();
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

    function decide(type, decision, decisionSource) {
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
        completed: decision === "approved",
        decisionSource: decisionSource || "manual",
        demoVersion: isVerifiedDemoRun && demoData && demoData.learningLoop ? demoData.learningLoop.demoVersion : null
      });
      if (type === "follow-up" && demoData && demoData.learningLoop && qualifiesForDemoRule(demoData.learningLoop.edit, original, finalText, event, isVerifiedDemoRun)) {
        learnedRule = createLearnedRule(demoData.learningLoop.rule, event);
        event.learnedRule = learnedRule;
      }
      ledger.add(event);
      var decisionEl = el(prefix + "Decision");
      decisionEl.textContent = decision === "approved" ? (event.edited ? "Approved with edits" : "Approved unchanged") : "Rejected · learning captured";
      decisionEl.dataset.tone = decision === "approved" ? "complete" : "rejected";
      setStatus(decision === "approved" ? "Action completed in the demo sandbox." : "Rejection captured for the learning loop.", decision === "approved" ? "complete" : "ready");
      renderMetrics();
      return event;
    }

    function loadDemo(shouldScroll, keepPresentation) {
      if (!keepPresentation) exitPresentation();
      return fetch("/data/commitment-loop-demo.json", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("demo_unavailable");
        return response.json();
      }).then(function (data) {
        demoData = data;
        transcript.value = data.transcript;
        renderAnalysis(prepareDemoAnalysis(data.analysis), "Verified demo snapshot · " + data.account, {
          verified: true,
          account: data.account,
          scenario: data.scenario
        });
        if (shouldScroll !== false) section.scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function () {
        setStatus("The bundled demo could not be loaded.", "error");
      });
    }

    function analyze() {
      exitPresentation();
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
        renderAnalysis(result.body, result.body.model, { verified: false });
      }).catch(function (error) {
        if (demoData && text === demoData.transcript) {
          renderAnalysis(prepareDemoAnalysis(demoData.analysis), "Verified demo snapshot · live model unavailable", {
            verified: true,
            account: demoData.account,
            scenario: demoData.scenario
          });
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
    transcript.addEventListener("input", function () {
      if (!currentAnalysis || transcript.value === analyzedTranscript) return;
      section.classList.add("has-stale-input");
      model.textContent = "Previous run";
      setStatus("Transcript changed. Evidence below is from the previous run; analyze again to refresh it.", "working");
      var sourcePreview = el("sourcePreview");
      sourcePreview.innerHTML = "<p>Transcript changed. Run analysis before tracing evidence to this input.</p>";
    });
    el("loadLoopDemo").addEventListener("click", function () { loadDemo(true, false); });
    el("analyzeLoop").addEventListener("click", analyze);
    Array.prototype.slice.call(document.querySelectorAll("[data-evidence-filter]")).forEach(function (button) {
      button.addEventListener("click", function () {
        activeFilter = button.dataset.evidenceFilter;
        Array.prototype.slice.call(document.querySelectorAll("[data-evidence-filter]")).forEach(function (candidate) {
          candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
        });
        if (currentAnalysis) renderEvidence(currentAnalysis, activeFilter);
      });
    });
    el("approveFollowup").addEventListener("click", function () { decide("follow-up", "approved"); });
    el("rejectFollowup").addEventListener("click", function () { decide("follow-up", "rejected"); });
    el("approveCrm").addEventListener("click", function () { decide("crm", "approved"); });
    el("rejectCrm").addEventListener("click", function () { decide("crm", "rejected"); });
    el("applyDemoEdit").addEventListener("click", applyDemoEdit);
    el("startPresentation").addEventListener("click", startPresentation);
    el("presentationNext").addEventListener("click", advancePresentation);
    el("presentationBack").addEventListener("click", function () {
      guidedStep = Math.max(0, guidedStep - 1);
      renderPresentationStep();
    });
    el("presentationRestart").addEventListener("click", startPresentation);
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
      loadDemo(false, false);
      setStatus("Verified demo reset. Local evaluation ledger cleared.", "idle");
    });

    renderMetrics();
    var launchParams = new URLSearchParams(root.location.search || "");
    if (launchParams.get("demo") === "commitment-loop" || launchParams.get("view") === "loop") {
      loadDemo(false, false);
    }
    root.addEventListener("productviewchange", function (event) {
      if (event.detail && event.detail.view === "loop" && !currentAnalysis) loadDemo(false, false);
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    sourceMatch: sourceMatch,
    filterEvidence: filterEvidence,
    feedbackState: feedbackState,
    compareArtifact: compareArtifact,
    createLearnedRule: createLearnedRule,
    presentationStep: presentationStep,
    presentationVisibility: presentationVisibility,
    qualifiesForDemoRule: qualifiesForDemoRule,
    artifactText: artifactText,
    sandboxRecord: sandboxRecord,
    prepareDemoAnalysis: prepareDemoAnalysis,
    init: init
  };
}));
