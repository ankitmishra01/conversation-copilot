insert into public.learned_rules (id, label, instruction, applies_to, excluded_from)
values (
  'renewal-expansion-separation',
  'Separate renewal execution from speculative expansion',
  'Keep speculative expansion out of renewal-critical customer follow-ups unless the customer explicitly asks for it there.',
  array['customer-follow-up'],
  array['crm']
)
on conflict (id) do nothing;

insert into public.conversations (id, idempotency_key, account_name, scenario, transcript, dataset_kind, analyzed_at, created_at)
values
  ('10000000-0000-4000-8000-000000000001', 'seed:northstar', 'Northstar Analytics', 'Renewal and expansion call', 'Ava: I will send the updated data-retention packet by Friday, October 9. Marcus: The immediate blocker is still the security packet.', 'demo', '2026-10-01T14:00:00Z', '2026-10-01T14:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', 'seed:juniper', 'Juniper Health', 'Renewal checkpoint', 'Maya: I will send the updated data-processing addendum today. Jonah: Let us revisit forecasting after the renewal is signed.', 'demo', '2026-10-02T14:00:00Z', '2026-10-02T14:00:00Z')
on conflict (idempotency_key) do nothing;

insert into public.agent_runs (id, conversation_id, idempotency_key, model, status, summary, warnings, dataset_kind, created_at)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'seed:northstar:analysis', 'verified-fixture', 'completed', 'Renewal depends on the security packet.', '[]', 'demo', '2026-10-01T14:00:05Z'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'seed:juniper:analysis', 'verified-fixture', 'completed', 'Renewal depends on legal review.', '[]', 'demo', '2026-10-02T14:00:05Z')
on conflict (idempotency_key) do nothing;

insert into public.artifacts (id, run_id, artifact_type, original_content)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'follow-up', '{"subject":"Northstar renewal next steps","body":"Send the packet and include analytics."}'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'crm', '{"summary":"Renewal blocked on security."}'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'follow-up', '{"subject":"Juniper renewal next step","body":"Send the addendum today."}'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'crm', '{"summary":"Renewal pending legal review."}')
on conflict (run_id, artifact_type) do nothing;

insert into public.evidence_items (run_id, evidence_key, kind, label, source_quote, source_speaker, source_date, verified, payload)
values
  ('20000000-0000-4000-8000-000000000001', 'northstar-c1', 'commitment', 'Send the updated data-retention packet', 'I will send the updated data-retention packet by Friday, October 9.', 'Ava', 'October 1, 2026', true, '{}'),
  ('20000000-0000-4000-8000-000000000001', 'northstar-b1', 'blocker', 'Security packet blocks renewal', 'The immediate blocker is still the security packet.', 'Marcus', 'October 1, 2026', true, '{}'),
  ('20000000-0000-4000-8000-000000000002', 'juniper-c1', 'commitment', 'Send the updated data-processing addendum', 'I will send the updated data-processing addendum today.', 'Maya', 'October 2, 2026', true, '{}'),
  ('20000000-0000-4000-8000-000000000002', 'juniper-e1', 'expansion', 'Forecasting interest after renewal', 'Let us revisit forecasting after the renewal is signed.', 'Jonah', 'October 2, 2026', true, '{}')
on conflict (run_id, evidence_key) do nothing;

insert into public.rule_applications (run_id, rule_id, created_at)
values ('20000000-0000-4000-8000-000000000002', 'renewal-expansion-separation', '2026-10-02T14:00:05Z')
on conflict (run_id, rule_id) do nothing;

insert into public.evaluation_events (
  id, artifact_id, run_id, idempotency_key, artifact_type, decision, reason,
  original_content, final_content, edited, edit_ratio, decision_seconds,
  completed, decision_source, demo_version, applied_rule_ids, created_at
)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'seed:e1', 'follow-up', 'approved', null, 'Send the packet and include analytics.', 'Send the packet.', true, 0.33333, 24, true, 'guided-replay', '2026-10-02', '{}', '2026-10-01T14:01:00Z'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'seed:e2', 'crm', 'approved', null, 'Renewal blocked on security.', 'Renewal blocked on security.', false, 0, 11, true, 'guided-replay', '2026-10-02', '{}', '2026-10-01T14:02:00Z'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'seed:e3', 'follow-up', 'approved', null, 'Send the addendum today.', 'Send the addendum today.', false, 0, 8, true, 'guided-replay', '2026-10-02', array['renewal-expansion-separation'], '2026-10-02T14:01:00Z'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'seed:e4', 'crm', 'rejected', 'Wrong owner or next step', 'Renewal pending legal review.', 'Renewal pending legal review.', false, 0, 18, false, 'guided-replay', '2026-10-02', array['renewal-expansion-separation'], '2026-10-02T14:02:00Z')
on conflict (idempotency_key) do nothing;
