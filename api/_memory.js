// api/_memory.js
// Turns the active scenario's config into (1) a compact "memory" text block for the AI prompts,
// (2) fixed answers for high-stakes watch-out topics, and (3) a deterministic snapshot card.
const profile = require("./_profile");

function lines(title, items, max) {
  if (!Array.isArray(items) || !items.length) return "";
  return title + ":\n" + items.slice(0, max || 12).map((item) => "- " + item).join("\n") + "\n";
}

function backgroundFor(scenarioKey) {
  const you = profile.getYou() || {};
  const all = Array.isArray(you.background) ? you.background : [];
  return all.filter((item) => Array.isArray(item.usefulFor) && (item.usefulFor.includes("all") || item.usefulFor.includes(scenarioKey)));
}

function forScenario(scenarioKey) {
  const scenario = profile.getScenario(scenarioKey);
  if (!scenario) return "";
  const you = profile.getYou() || {};
  const background = backgroundFor(scenarioKey);
  const proofFromBackground = background.reduce((acc, b) => acc.concat(b.proofPoints || []), []);
  return [
    "SCENARIO: " + scenario.label,
    "GOAL: " + scenario.goal,
    "POSITIONING: " + (you.positioning || ""),
    lines("BACKGROUND PROOF", proofFromBackground, 12),
    "FIT SUMMARY: " + (scenario.fitSummary || ""),
    lines("PROOF BANK", scenario.proofBank, 10),
    "HONEST GAP: " + (scenario.honestGap || ""),
    lines("SETTLED ANSWERS (state these facts literally; never invent a different one)", scenario.settledAnswers, 10),
    lines("NEVER SAY", scenario.neverSay, 10),
    lines("QUESTIONS YOU CAN ASK BACK", scenario.questionsToAsk, 10),
    "VOCABULARY: " + (scenario.domainVocabulary || []).join(", ")
  ].filter(Boolean).join("\n");
}

function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// A trigger must match a whole word or whole phrase in the text, never a substring inside another word
// ("rate" must not match "strategy" or "integrate"; "pay" must not match "paying").
function matchesTrigger(text, term) {
  const t = normalize(term).replace(/[^a-z0-9']+/g, " ").trim();
  if (!t) return false;
  const padded = " " + normalize(text).replace(/[^a-z0-9']+/g, " ").trim() + " ";
  return padded.indexOf(" " + t + " ") !== -1;
}

function watchFor(scenarioKey, text) {
  const scenario = profile.getScenario(scenarioKey);
  if (!scenario || !Array.isArray(scenario.watchOuts)) return "";
  const found = [];
  scenario.watchOuts.forEach((w) => {
    const hit = (w.triggers || []).some((t) => matchesTrigger(text, t));
    if (hit && w.tip) found.push(w.topic + ": " + w.tip);
  });
  return found.join(" | ").slice(0, 520);
}

function overrideFor(scenarioKey, text, langSide) {
  const scenario = profile.getScenario(scenarioKey);
  if (!scenario || !Array.isArray(scenario.watchOuts)) return null;
  const hit = scenario.watchOuts.find((w) => (w.triggers || []).some((t) => matchesTrigger(text, t)) && w.fixedLine);
  if (!hit) return null;
  const say = langSide === "target" ? (hit.fixedLine.other || hit.fixedLine.primary) : hit.fixedLine.primary;
  const sayOther = langSide === "target" ? hit.fixedLine.primary : (hit.fixedLine.other || hit.fixedLine.primary);
  return {
    say,
    sayOther,
    direct: String(say || "").split(/(?<=[.!?])\s/)[0],
    proof: "Settled answer from your config, not generated",
    topic: hit.topic
  };
}

function shorten(text, n) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return (stop > n * 0.5 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(" "))).replace(/[.,;:]$/, "") + "…";
}

function card(scenarioKey) {
  const scenario = profile.getScenario(scenarioKey);
  if (!scenario) return null;
  const background = backgroundFor(scenarioKey);
  const job = [shorten(scenario.label, 90), shorten(scenario.fitSummary, 150)].filter(Boolean);
  const align = background.slice(0, 8).reduce((acc, b) => acc.concat((b.proofPoints || []).slice(0, 1).map((p) => ({ need: shorten(b.label, 70), proof: shorten(p, 110) }))), []);
  const keys = [];
  if (scenario.honestGap) keys.push("Gap: " + shorten(scenario.honestGap, 130));
  (scenario.settledAnswers || []).forEach((s) => keys.push(shorten(s, 130)));
  (scenario.questionsToAsk || []).slice(0, 2).forEach((q) => keys.push("Ask: " + shorten(q, 110)));
  return { title: scenario.label, job: job.slice(0, 5), align: align.slice(0, 7), keys: keys.slice(0, 7) };
}

function info() {
  return { loaded: Boolean(profile.getYou()), demo: profile.isDemo() };
}

module.exports = { forScenario, watchFor, overrideFor, card, info };
