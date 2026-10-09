-- Per-workspace ownership. The API runs on the service role (which bypasses RLS), so the server scopes
-- every query by workspace_id; RLS stays enabled with no anon/authenticated policies as a second wall.
alter table public.conversations add column if not exists workspace_id text not null default 'default';
alter table public.agent_runs add column if not exists workspace_id text not null default 'default';

create index if not exists conversations_workspace_id_idx on public.conversations(workspace_id);
create index if not exists agent_runs_workspace_id_idx on public.agent_runs(workspace_id, created_at desc);

-- Idempotency keys are only unique within a workspace, so two workspaces cannot collide or overwrite each other.
alter table public.conversations drop constraint if exists conversations_idempotency_key_key;
alter table public.conversations add constraint conversations_workspace_idempotency_key unique (workspace_id, idempotency_key);
alter table public.agent_runs drop constraint if exists agent_runs_idempotency_key_key;
alter table public.agent_runs add constraint agent_runs_workspace_idempotency_key unique (workspace_id, idempotency_key);
