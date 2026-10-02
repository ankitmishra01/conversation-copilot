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

  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("Close the Loop — a Ghost product concept"), "the page title must frame the assessment concept");
  assert.ok(html.includes("Independent interview concept by Ankit Mishra"), "the page must not imply official Ghost ownership");
  assert.ok(html.includes("Context → agents → evals → attribution"), "the hero must connect the prototype to Ghost's product thesis");
  assert.ok(html.includes("Try the verified workflow"), "the branded hero needs a direct demo CTA");

  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.ok(css.includes("--ghost-navy: #0c1428"), "the theme must include Ghost's deep navy direction");
  assert.ok(css.includes("--ghost-violet: #8b5cf6"), "the theme must include Ghost's violet accent");
  assert.ok(css.includes("--ghost-ivory: #f7f7f2"), "the theme must include Ghost's warm off-white canvas");

  const script = fs.readFileSync(path.join(__dirname, "..", "close-loop.js"), "utf8");
  assert.ok(script.includes('classList.add("concept-mode")'), "the demo URL must focus the page on the assessment concept");
  assert.ok(script.includes("loadDemo(false)"), "automatic demo loading must preserve the branded hero position");

  console.log("close-loop-ui.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
