// test/close-loop-ui.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const demo = require("../data/commitment-loop-demo.json");
const analysisApi = require("../api/close-loop");

function run() {
  const ui = require("../close-loop");
  const normalized = analysisApi.normalizeAnalysis(demo.analysis, demo.transcript);
  const allEvidence = normalized.commitments.concat(normalized.blockers, normalized.expansionSignals);
  assert.ok(allEvidence.length >= 6, "the demo must exercise commitments, blockers, and expansion signals");
  assert.ok(allEvidence.every((item) => item.verified), "every bundled demo claim must have source evidence");
  assert.ok(allEvidence.every((item) => item.sourceSpeaker && item.sourceDate && item.sourceType), "every bundled fact must carry speaker, date, and source type");

  const email = ui.artifactText("follow-up", normalized);
  assert.ok(email.startsWith("Subject: Northstar renewal next steps\n\n"), "follow-up artifacts must retain their subject");
  assert.ok(email.includes("Friday, October 9"));

  const crm = ui.artifactText("crm", normalized);
  assert.ok(crm.includes("Next step: Send updated data-retention packet"));
  assert.ok(crm.includes("Stage suggestion: Renewal - security review"));

  const outbox = ui.sandboxRecord("follow-up", "Final email copy", "2026-10-01T12:00:00.000Z");
  assert.deepStrictEqual(outbox, { kind: "outbox", label: "Email queued in demo outbox", content: "Final email copy", completedAt: "2026-10-01T12:00:00.000Z" });
  const record = ui.sandboxRecord("crm", "Final CRM note", "2026-10-01T12:00:00.000Z");
  assert.strictEqual(record.kind, "account-record");
  assert.strictEqual(record.label, "CRM note written to demo account");

  const source = ui.sourceMatch(demo.transcript, normalized.commitments[0].sourceQuote);
  assert.ok(source && source.start >= 0, "a finding must resolve to its exact transcript source");
  assert.strictEqual(source.quote, normalized.commitments[0].sourceQuote);
  assert.strictEqual(ui.sourceMatch(demo.transcript, "invented quote"), null, "unsupported evidence must never receive a source location");
  const wrappedTranscript = "Maya: I will send the security\npacket by Friday.";
  const wrappedSource = ui.sourceMatch(wrappedTranscript, "I WILL SEND THE SECURITY PACKET BY FRIDAY.");
  assert.ok(wrappedSource, "source selection must use the same whitespace-insensitive, case-insensitive contract as verification");
  assert.strictEqual(wrappedSource.quote, "I will send the security\npacket by Friday.");

  assert.strictEqual(ui.filterEvidence(normalized, "all").length, 6);
  assert.strictEqual(ui.filterEvidence(normalized, "commitment").length, 3);
  assert.strictEqual(ui.filterEvidence(normalized, "blocker").length, 2);
  assert.strictEqual(ui.filterEvidence(normalized, "expansion").length, 1);

  assert.deepStrictEqual(ui.feedbackState([]), { stage: "context", pending: 2, completed: 0, rejected: 0 });
  assert.deepStrictEqual(ui.feedbackState([{ decision: "approved", completed: true }]), { stage: "evaluation", pending: 1, completed: 1, rejected: 0 });
  assert.deepStrictEqual(ui.feedbackState([{ decision: "approved", completed: true }, { decision: "approved", completed: true }]), { stage: "attribution", pending: 0, completed: 2, rejected: 0 });
  assert.deepStrictEqual(ui.feedbackState([{ decision: "rejected", completed: false }]), { stage: "evaluation", pending: 1, completed: 0, rejected: 1 });
  assert.deepStrictEqual(
    ui.feedbackState([
      { artifactType: "follow-up", decision: "approved", completed: true },
      { artifactType: "follow-up", decision: "approved", completed: true }
    ]),
    { stage: "evaluation", pending: 1, completed: 1, rejected: 0 },
    "repeated decisions on one artifact must not complete the workflow"
  );

  const retryStorage = {
    value: "[]",
    getItem() { return this.value; },
    setItem(key, value) { this.value = value; }
  };
  const queuedPayload = { idempotencyKey: "evaluation:one", runId: "run-one", decision: "approved" };
  ui.queuePendingEvaluation(retryStorage, queuedPayload);
  ui.queuePendingEvaluation(retryStorage, Object.assign({}, queuedPayload, { decision: "rejected" }));
  assert.deepStrictEqual(ui.readPendingEvaluations(retryStorage), [Object.assign({}, queuedPayload, { decision: "rejected" })], "retry queue writes must be idempotent");
  assert.deepStrictEqual(ui.removePendingEvaluation(retryStorage, "evaluation:one"), [], "successful retries must leave the queue clean");
  retryStorage.value = "not-json";
  assert.deepStrictEqual(ui.readPendingEvaluations(retryStorage), [], "corrupt browser state must not block the workflow");

  const comparison = ui.compareArtifact(
    "Keep the renewal moving.\nInclude analytics pricing now.",
    "Keep the renewal moving."
  );
  assert.deepStrictEqual(comparison.removed, ["Include analytics pricing now."]);
  assert.deepStrictEqual(comparison.added, []);

  const learnedRule = ui.createLearnedRule(demo.learningLoop.rule, {
    runId: "run-1",
    artifactType: "follow-up",
    decision: "approved",
    edited: true
  });
  assert.strictEqual(learnedRule.id, "renewal-expansion-separation");
  assert.strictEqual(learnedRule.sourceRunId, "run-1");
  assert.deepStrictEqual(learnedRule.appliesTo, ["customer-follow-up"]);
  assert.deepStrictEqual(learnedRule.excludedFrom, ["crm"]);

  assert.strictEqual(ui.presentationStep(-1).index, 0);
  assert.strictEqual(ui.presentationStep(99).index, 7);
  assert.strictEqual(ui.presentationStep(5).action, "Run next conversation");
  assert.deepStrictEqual(ui.presentationVisibility(3), { replay: false, rule: false, nextRun: false, outcome: false });
  assert.deepStrictEqual(ui.presentationVisibility(4), { replay: true, rule: true, nextRun: false, outcome: false });
  assert.deepStrictEqual(ui.presentationVisibility(7), { replay: true, rule: true, nextRun: true, outcome: true });

  const correction = demo.learningLoop.edit;
  const originalDraft = ui.artifactText("follow-up", normalized);
  const correctedDraft = originalDraft.replace(correction.remove, "");
  assert.strictEqual(ui.qualifiesForDemoRule(correction, originalDraft, correctedDraft, { decision: "approved", edited: true }, true), true);
  assert.strictEqual(ui.qualifiesForDemoRule(correction, originalDraft, originalDraft + "\nThanks", { decision: "approved", edited: true }, true), false, "unrelated edits must not create the demo rule");
  assert.strictEqual(ui.qualifiesForDemoRule(correction, originalDraft, correctedDraft, { decision: "rejected", edited: true }, true), false, "rejected work must not create a learned rule");
  assert.strictEqual(ui.qualifiesForDemoRule(correction, originalDraft, correctedDraft, { decision: "approved", edited: true }, false), false, "live runs must not inherit a bundled demo rule");

  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("view-controller.js"), "the page must load the product mode controller");
  assert.ok(html.includes('data-view-target="live"'), "the shell must expose Live copilot as a real mode");
  assert.ok(html.includes('data-view-target="coach"'), "the shell must expose Answer coach as a real mode");
  assert.ok(html.includes('data-view-target="loop"'), "the shell must expose Close the Loop as a real mode");
  assert.ok(html.includes('data-view-target="evals"'), "the shell must expose the Eval Control Tower as a real mode");
  assert.ok(html.includes('data-view-panel="live"'), "Live copilot must have its own workspace");
  assert.ok(html.includes('data-view-panel="coach"'), "Answer coach must have its own workspace");
  assert.ok(html.includes('data-view-panel="loop"'), "Close the Loop must have its own workspace");
  assert.ok(html.includes('data-view-panel="evals"'), "the Eval Control Tower must have its own workspace");
  assert.ok(html.includes('id="saveLoopRun"') && html.includes('id="deleteLoopRun"'), "transcript retention must require an explicit save and support deletion");
  assert.ok(html.includes('id="evalDatasetFilter"') && html.includes('id="evalArtifactFilter"'), "the Control Tower must separate demo/live data and artifact types");
  assert.ok(html.includes('id="evalMetricApproval"') && html.includes('id="evalRecentRuns"'), "the Control Tower must expose headline metrics and traceable recent runs");
  assert.ok(html.includes('src="/eval-dashboard.js"'), "the Control Tower client must load independently");
  assert.ok(html.includes("Independent product concept by Ankit Mishra"), "the page must not imply official Ghost ownership");
  assert.ok(html.includes("wordmark-paper.png"), "the shell must use Ghost's public paper wordmark asset");
  assert.ok(html.includes("Context") && html.includes("Agent action") && html.includes("Evaluation") && html.includes("Attribution"), "the interface must expose the complete feedback loop");
  assert.ok(html.includes("Replay verified demo"), "the verified workflow must be replayable");
  assert.ok(html.includes("Evidence filters"), "evidence must be filterable without another model call");
  assert.ok(html.includes('id="conceptFindingCount"') && html.includes('id="conceptPendingCount"'), "hero counts must be live state, not static copy");
  assert.ok(html.includes('id="loopAccountName"') && html.includes('id="filterAllCount"'), "account and filter labels must update for live runs");
  assert.ok(html.includes('id="startPresentation"') && html.includes('id="presentationNext"'), "the verified learning loop must have guided presentation controls");
  assert.ok(html.includes('id="learningRulePanel"') && html.includes('id="nextRunPanel"') && html.includes('id="outcomePanel"'), "the interface must expose learning, next-run, and outcome states");
  assert.ok(html.includes('id="presentationAnnouncement"') && html.includes('aria-live="polite"'), "guided steps must be announced to assistive technology");
  assert.ok(html.includes('id="learningRulePanel" tabindex="-1"') && html.includes('id="outcomePanel" tabindex="-1"'), "newly revealed guided panels must accept deliberate focus");
  assert.ok(html.includes('aria-labelledby="transcriptTitle"') && html.includes('aria-labelledby="answerTitle"'), "live and practice textareas must have programmatic labels");

  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.ok(css.includes("--ghost-ink: #10172a"), "the theme must use Ghost's measured ink color");
  assert.ok(css.includes("--ghost-violet: #8059ff"), "the theme must use Ghost's measured violet accent");
  assert.ok(css.includes("--ghost-paper: #f6f7f1"), "the theme must use Ghost's measured paper color");
  assert.ok(css.includes("PP Neue Montreal"), "the interface must use Ghost's public display typography");
  assert.ok(css.includes("min-height: 44px"), "interactive controls must meet the mobile touch target minimum");
  assert.ok(css.includes("--violet-action: #6238d1"), "normal-sized interactive text needs a darker accessible violet while preserving the brand accent");
  assert.ok(css.includes(".eval-dashboard-view") && css.includes(".eval-metric-grid"), "the Control Tower needs a responsive product surface");

  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(app.includes("var safePayload = payload || {}"), "local fallback rendering must not dereference a null payload");
  assert.ok(app.includes('querySelector("[data-view-panel=coach]")'), "overlay and mini-window modes must expose the answer surface");

  const design = fs.readFileSync(path.join(__dirname, "..", "DESIGN.md"), "utf8");
  assert.ok(design.includes("#10172A") && design.includes("#F6F7F1") && design.includes("#8059FF"), "DESIGN.md must lock the measured Ghost palette");
  assert.ok(design.includes("Direction B"), "DESIGN.md must record the approved visual direction");
  assert.ok(design.includes("Independent product concept by Ankit Mishra"), "DESIGN.md must preserve the authorship boundary");

  const script = fs.readFileSync(path.join(__dirname, "..", "close-loop.js"), "utf8");
  assert.ok(script.includes("loadDemo(false, false)"), "automatic demo loading must preserve the branded hero position and remain outside presentation mode");
  assert.ok(script.includes("analyzedTranscript"), "source highlighting must retain the analyzed source snapshot");
  assert.ok(script.includes('fetch("/api/runs"') && script.includes('fetch("/api/evaluations"'), "saved runs and decisions must sync through protected server routes");
  assert.ok(demo.learningLoop && demo.learningLoop.rule && demo.learningLoop.nextRun && demo.learningLoop.outcome, "the verified demo must include the complete learning replay contract");
  assert.strictEqual(demo.learningLoop.rule.id, "renewal-expansion-separation");
  assert.ok(demo.learningLoop.nextRun.baselineFollowUp.body.toLowerCase().includes("analytics"), "the baseline must visibly repeat the old behavior");
  assert.ok(!demo.learningLoop.nextRun.learnedFollowUp.body.toLowerCase().includes("analytics"), "the learned draft must visibly apply the rule");

  console.log("close-loop-ui.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
