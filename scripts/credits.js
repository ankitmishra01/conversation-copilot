#!/usr/bin/env node
// Shows the AI Gateway credit balance and which credential/models the live deployment uses. Key-protected.
const fs = require("fs");
const path = require("path");
function envLocal() {
  try { return fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8"); } catch (e) { return ""; }
}
let BASE = process.env.COPILOT_URL || "";
if (!BASE) BASE = (/^COPILOT_URL=(.+)$/m.exec(envLocal()) || [])[1] || "http://localhost:3000";
let key = process.env.COPILOT_KEY || "";
if (!key) key = (/^COPILOT_KEY=(.+)$/m.exec(envLocal()) || [])[1] || "";
fetch(BASE + "/api/translate", { method: "POST", headers: { "Content-Type": "application/json", "x-copilot-key": key.trim() }, body: JSON.stringify({ billing: true }) })
  .then((r) => r.json())
  .then((d) => {
    if (d.mode !== "billing") { console.log("Could not read billing info:", d.error || JSON.stringify(d)); return; }
    const c = d.credits || {};
    console.log(`Credential in use : ${d.credential}`);
    console.log(`Answer model      : ${d.models.answer}   (fallbacks: ${d.models.fallbacks.join(", ")})`);
    console.log(`Credit balance    : $${Number(c.balance).toFixed(2)}   (used so far: $${Number(c.total_used).toFixed(2)})`);
    const rs = d.reserve || {};
    if (rs.activeNow) {
      const avail = Math.max(0, Number(c.balance) - rs.usd - 0.05);
      console.log(`Reserve              : $${Number(rs.usd).toFixed(2)} until ${new Date(rs.until).toLocaleString()}  ->  available for testing now: $${avail.toFixed(2)}`);
    } else console.log("Reserve             : not active");
    console.log("Cost varies with the models and gateway you configure; run this command again after a call to see your own measured usage.");
  })
  .catch((e) => console.log("Request failed:", e.message));
