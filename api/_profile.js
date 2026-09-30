// api/_profile.js
// Loads the user's copilot configuration. Priority: a synced private file (api/_data/profile.json),
// then the user's own local file (data/profile.json), then the shipped example (demo mode).
// Each require below uses a static, literal path (never one built from a variable) so bundlers —
// notably Vercel's serverless function file tracer — can find and include these files at deploy time.
function loadSynced() {
  try { return require("./_data/profile.json"); } catch (e) { return null; }
}
function loadLocal() {
  try { return require("../data/profile.json"); } catch (e) { return null; }
}
function loadExample() {
  try { return require("../data/profile.example.json"); } catch (e) { return null; }
}

let cached = null;
function load() {
  if (cached) return cached;
  const synced = loadSynced();
  const local = loadLocal();
  const example = loadExample();
  const data = synced || local || example;
  cached = { data: data || null, demo: !synced && !local && Boolean(example) };
  return cached;
}

function getYou() {
  const { data } = load();
  return (data && data.you) || null;
}

function listScenarios() {
  const { data } = load();
  return (data && data.scenarios) || {};
}

function getScenario(key) {
  const scenarios = listScenarios();
  if (scenarios[key]) return scenarios[key];
  const first = Object.keys(scenarios)[0];
  return first ? scenarios[first] : null;
}

function getStyle() {
  const { data } = load();
  return (data && data.style) || {};
}

function isDemo() {
  return load().demo;
}

function resetCache() {
  cached = null;
}

module.exports = { load, getYou, listScenarios, getScenario, getStyle, isDemo, resetCache };
