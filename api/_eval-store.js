const { getSupabaseAdmin } = require("./_supabase");
const { buildDashboard } = require("./_eval-analytics");

function throwOn(error) {
  if (error) {
    const wrapped = new Error("supabase_query_failed");
    wrapped.cause = error;
    throw wrapped;
  }
}

function evidenceRows(runId, analysis) {
  const groups = [
    ["commitment", analysis.commitments || []],
    ["blocker", analysis.blockers || []],
    ["expansion", analysis.expansionSignals || []]
  ];
  return groups.flatMap(([kind, items]) => items.map((item, index) => ({
    run_id: runId,
    evidence_key: String(item.id || kind + "-" + (index + 1)),
    kind,
    label: String(item.action || item.label || ""),
    source_quote: String(item.sourceQuote || ""),
    source_speaker: String(item.sourceSpeaker || item.owner || "Speaker not stated"),
    source_date: String(item.sourceDate || "Date not stated"),
    verified: item.verified === true,
    payload: item
  })));
}

function artifactRows(runId, analysis) {
  const followUp = analysis.followUp || {};
  const crm = analysis.crm || {};
  return [
    { run_id: runId, artifact_type: "follow-up", original_content: { subject: followUp.subject || "", body: followUp.body || "" } },
    { run_id: runId, artifact_type: "crm", original_content: crm }
  ];
}

function createEvalStore(client) {
  function db() { return client || getSupabaseAdmin(); }
  return {
    async saveRun(input) {
      const conversationResult = await db().from("conversations").upsert({
        workspace_id: input.workspace,
        idempotency_key: input.idempotencyKey,
        account_name: input.account,
        scenario: input.scenario,
        transcript: input.transcript,
        dataset_kind: input.datasetKind,
        analyzed_at: input.generatedAt || new Date().toISOString()
      }, { onConflict: "workspace_id,idempotency_key" }).select("id, created_at").single();
      throwOn(conversationResult.error);
      const conversation = conversationResult.data;
      const runResult = await db().from("agent_runs").upsert({
        conversation_id: conversation.id,
        workspace_id: input.workspace,
        idempotency_key: input.idempotencyKey + ":analysis",
        model: input.model || "unknown",
        status: "completed",
        summary: input.analysis.summary || "",
        warnings: input.analysis.warnings || [],
        dataset_kind: input.datasetKind
      }, { onConflict: "workspace_id,idempotency_key" }).select("id, created_at").single();
      throwOn(runResult.error);
      const run = runResult.data;
      const artifacts = await db().from("artifacts").upsert(artifactRows(run.id, input.analysis), { onConflict: "run_id,artifact_type" });
      throwOn(artifacts.error);
      const evidence = evidenceRows(run.id, input.analysis);
      if (evidence.length) {
        const evidenceResult = await db().from("evidence_items").upsert(evidence, { onConflict: "run_id,evidence_key" });
        throwOn(evidenceResult.error);
      }
      return { runId: run.id, savedAt: run.created_at || conversation.created_at };
    },

    async deleteRun(runId, workspace) {
      const lookup = await db().from("agent_runs").select("conversation_id").eq("id", runId).eq("workspace_id", workspace).maybeSingle();
      throwOn(lookup.error);
      if (!lookup.data) return false;
      const deleted = await db().from("conversations").delete().eq("id", lookup.data.conversation_id);
      throwOn(deleted.error);
      return true;
    },

    async saveEvaluation(input) {
      const owned = await db().from("agent_runs").select("id").eq("id", input.runId).eq("workspace_id", input.workspace).maybeSingle();
      throwOn(owned.error);
      if (!owned.data) throw new Error("artifact_not_found");
      const artifact = await db().from("artifacts").select("id").eq("run_id", input.runId).eq("artifact_type", input.artifactType).maybeSingle();
      throwOn(artifact.error);
      if (!artifact.data) throw new Error("artifact_not_found");
      const result = await db().from("evaluation_events").upsert({
        artifact_id: artifact.data.id,
        run_id: input.runId,
        idempotency_key: input.idempotencyKey,
        artifact_type: input.artifactType,
        decision: input.decision,
        reason: input.reason || null,
        original_content: input.original,
        final_content: input.final,
        edited: input.edited,
        edit_ratio: input.editRatio,
        decision_seconds: input.decisionSeconds,
        completed: input.completed,
        decision_source: input.decisionSource,
        demo_version: input.demoVersion,
        applied_rule_ids: input.appliedRuleIds || []
      }, { onConflict: "idempotency_key" }).select("*").single();
      throwOn(result.error);
      return result.data;
    },

    async getDashboard(filters) {
      const runResult = await db().from("agent_runs").select("id, created_at, dataset_kind, conversations!inner(account_name, scenario)").eq("workspace_id", filters.workspace).order("created_at", { ascending: false }).limit(200);
      throwOn(runResult.error);
      let runs = (runResult.data || []).map((run) => ({
        id: run.id,
        created_at: run.created_at,
        dataset_kind: run.dataset_kind,
        account_name: run.conversations && run.conversations.account_name,
        scenario: run.conversations && run.conversations.scenario
      }));
      if (filters.dataset && filters.dataset !== "all") runs = runs.filter((run) => run.dataset_kind === filters.dataset);
      const runIds = runs.map((run) => run.id);
      if (!runIds.length) return buildDashboard({ runs: [], evaluations: [], evidence: [] });
      let evalQuery = db().from("evaluation_events").select("*").in("run_id", runIds).order("created_at", { ascending: true });
      if (filters.artifact && filters.artifact !== "all") evalQuery = evalQuery.eq("artifact_type", filters.artifact);
      const [evalResult, evidenceResult] = await Promise.all([
        evalQuery,
        db().from("evidence_items").select("run_id, kind, label, source_quote, verified").in("run_id", runIds)
      ]);
      throwOn(evalResult.error); throwOn(evidenceResult.error);
      return buildDashboard({ runs, evaluations: evalResult.data || [], evidence: evidenceResult.data || [] });
    }
  };
}

module.exports = { createEvalStore, evidenceRows, artifactRows };
