const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
  assert.ok(migrations.length, "the Supabase schema must be reproducible from migrations");
  const sql = migrations.map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8")).join("\n").toLowerCase();
  ["conversations", "agent_runs", "artifacts", "evidence_items", "evaluation_events", "learned_rules", "rule_applications"].forEach((table) => {
    assert.ok(sql.includes("create table") && sql.includes(table), table + " must exist");
    assert.ok(sql.includes("alter table public." + table + " enable row level security"), table + " must enable RLS");
  });
  assert.ok(sql.includes("revoke all") && sql.includes("from anon, authenticated"), "public roles must have no ledger access");
  assert.ok(sql.includes("on delete cascade"), "deleting a conversation must delete dependent records");
  assert.ok(sql.includes("idempotency_key") && sql.includes("unique"), "writes must be idempotent");
  assert.ok(sql.includes("revoke execute on function public.rls_auto_enable() from public, anon, authenticated"), "the project-default SECURITY DEFINER helper must not be publicly executable");
  const seed = fs.readFileSync(path.join(__dirname, "..", "supabase", "seed.sql"), "utf8").toLowerCase();
  assert.ok(seed.includes("dataset_kind") && seed.includes("demo"), "seed data must be explicitly labelled as demo data");

  console.log("supabase-schema.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
