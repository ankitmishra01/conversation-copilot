create extension if not exists pgcrypto;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  account_name text not null,
  scenario text not null,
  transcript text not null check (char_length(transcript) between 1 and 20000),
  dataset_kind text not null default 'live' check (dataset_kind in ('demo', 'live')),
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  idempotency_key text not null unique,
  model text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  summary text not null default '',
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  dataset_kind text not null default 'live' check (dataset_kind in ('demo', 'live')),
  created_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('follow-up', 'crm')),
  original_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, artifact_type)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  evidence_key text not null,
  kind text not null check (kind in ('commitment', 'blocker', 'expansion')),
  label text not null,
  source_quote text not null,
  source_speaker text not null,
  source_date text not null,
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, evidence_key)
);

create table public.learned_rules (
  id text primary key,
  label text not null,
  instruction text not null,
  applies_to text[] not null default '{}',
  excluded_from text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rule_applications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  rule_id text not null references public.learned_rules(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (run_id, rule_id)
);

create table public.evaluation_events (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  idempotency_key text not null unique,
  artifact_type text not null check (artifact_type in ('follow-up', 'crm')),
  decision text not null check (decision in ('approved', 'rejected')),
  reason text,
  original_content text not null default '',
  final_content text not null default '',
  edited boolean not null default false,
  edit_ratio numeric(6, 5) not null default 0 check (edit_ratio between 0 and 1),
  decision_seconds integer not null default 0 check (decision_seconds >= 0),
  completed boolean not null default false,
  decision_source text not null default 'manual',
  demo_version text,
  applied_rule_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (decision <> 'rejected' or nullif(btrim(reason), '') is not null)
);

create index agent_runs_conversation_id_idx on public.agent_runs(conversation_id);
create index artifacts_run_id_idx on public.artifacts(run_id);
create index evidence_items_run_id_idx on public.evidence_items(run_id);
create index evaluation_events_run_id_created_at_idx on public.evaluation_events(run_id, created_at desc);
create index rule_applications_run_id_idx on public.rule_applications(run_id);

create view public.eval_latest_decisions
with (security_invoker = true)
as
select distinct on (run_id, artifact_type)
  id, artifact_id, run_id, artifact_type, decision, reason, edited, edit_ratio,
  decision_seconds, completed, decision_source, applied_rule_ids, created_at
from public.evaluation_events
order by run_id, artifact_type, created_at desc, id desc;

alter table public.conversations enable row level security;
alter table public.agent_runs enable row level security;
alter table public.artifacts enable row level security;
alter table public.evidence_items enable row level security;
alter table public.evaluation_events enable row level security;
alter table public.learned_rules enable row level security;
alter table public.rule_applications enable row level security;

revoke all on table public.conversations, public.agent_runs, public.artifacts,
  public.evidence_items, public.evaluation_events, public.learned_rules,
  public.rule_applications, public.eval_latest_decisions from anon, authenticated;

grant select, insert, update, delete on table public.conversations, public.agent_runs,
  public.artifacts, public.evidence_items, public.evaluation_events,
  public.learned_rules, public.rule_applications to service_role;
grant select on table public.eval_latest_decisions to service_role;
