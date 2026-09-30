#!/usr/bin/env node
// Optional: pulls your profile.json from a private repo (handy if you want to keep real config out of
// this repo, or share one config across a team) into api/_data/profile.json, which api/_profile.js
// prefers over the local data/profile.json. Uses your local `gh` login, so no token is stored anywhere.
// Re-run, then redeploy, after that repo changes.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = process.env.MEMORY_REPO;
const FILE_PATH = process.env.MEMORY_PATH || "profile.json";
const OUT = path.join(__dirname, "..", "api", "_data", "profile.json");

function main() {
  if (!REPO) {
    console.error("Set MEMORY_REPO (e.g. yourname/your-private-config-repo) to use this optional feature.");
    process.exit(1);
  }
  function gh(apiPath) {
    return execFileSync("gh", ["api", apiPath], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  }
  const commit = JSON.parse(gh(`repos/${REPO}/commits/HEAD`));
  const meta = JSON.parse(gh(`repos/${REPO}/contents/${FILE_PATH}`));
  const data = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
  data.syncedAt = new Date().toISOString();
  data.source = REPO;
  data.commit = commit.sha;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(`Synced ${REPO}/${FILE_PATH}@${commit.sha.slice(0, 7)} -> ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
}

if (require.main === module) main();
module.exports = { main };
