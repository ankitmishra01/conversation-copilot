// api/profile.js
// Public-safe view of the profile for the browser UI. The full profile (settled answers, watch-outs,
// honest gaps, never-say lines) stays server-side only, read directly by _memory.js — those fields are
// never sent to the browser, because the other party on a call could see them via devtools if they were.
const { keyOk } = require("./_access");
const profile = require("./_profile");

function sanitizeScenario(scenario) {
  return {
    label: scenario.label,
    goal: scenario.goal,
    language: scenario.language,
    domainVocabulary: scenario.domainVocabulary,
    fitSummary: scenario.fitSummary,
    proofBank: scenario.proofBank,
    questionsToAsk: scenario.questionsToAsk
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  if (!keyOk(req)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ error: "key_required", keyRequired: true }));
    return;
  }
  const you = profile.getYou() || {};
  const scenarios = profile.listScenarios();
  const style = profile.getStyle() || {};
  const safeScenarios = {};
  Object.keys(scenarios).forEach((key) => {
    safeScenarios[key] = sanitizeScenario(scenarios[key] || {});
  });
  res.statusCode = 200;
  res.end(JSON.stringify({
    demo: profile.isDemo(),
    you: { name: you.name, role: you.role, positioning: you.positioning, background: you.background },
    scenarios: safeScenarios,
    style: {
      preferredVerbs: style.preferredVerbs,
      safeSentenceStarters: style.safeSentenceStarters,
      fillerWords: style.fillerWords
    }
  }));
};
