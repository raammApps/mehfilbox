-- The platform console gains its first writes, and an audit trail for them (N-27).
--
-- doc 15 §1 keeps read-only as the default stance: support means "look at what the partner is
-- describing", and a console that can edit somebody else's wedding is the most dangerous page in
-- the product. Writes are added one at a time, and each one is recorded here — an unaudited
-- platform write is indistinguishable from an intrusion after the fact.

-- Suspension is an *org* state, not a catalogue state. A catalogue lapses on its own schedule
-- (PRICING.md §2); an org is suspended for non-payment or abuse, and the two must not be
-- conflated — suspending a studio does not expire the weddings it has already delivered.
alter table orgs
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended'));

create table if not exists platform_audit (
  id            uuid primary key,
  -- Who acted. The email is denormalised deliberately: an audit row must stay readable after the
  -- admin's account is gone, which is exactly when it is being read.
  actor_id      uuid not null,
  actor_email   text not null,
  action        text not null,
  org_id        uuid references orgs (id) on delete set null,
  -- `on delete set null` above, and the slug kept here, for the same reason: deleting an org must
  -- not erase the record of what was done to it.
  org_slug      text,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists platform_audit_recent_idx on platform_audit (created_at desc);
create index if not exists platform_audit_org_idx on platform_audit (org_id, created_at desc);

-- RLS as on every other table (0002). Only the service-role key reads this, and the anon key must
-- never see who suspended whom.
alter table platform_audit enable row level security;
