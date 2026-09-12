-- Credits (D-38, doc 16 §7, N-65) — the table REQUIREMENTS.md §9 specifies.
--
-- A credit is one wedding's first publish. Registration grants a studio one; a catalogue's first
-- publish consumes one; a republish after an unpublish consumes nothing. Until online payment
-- lands (N-20) the platform console grants them, with a reason on the audit row, and this table
-- is where a plan finally becomes something the product reads.
create table if not exists credits (
  id                      uuid primary key,
  org_id                  uuid not null references orgs (id) on delete cascade,
  plan_id                 text not null default 'deliver',
  -- 'registration', a platform admin's email, or later a payment id.
  granted_by              text not null default 'registration',
  reason                  text not null default '',
  purchased_at            timestamptz not null default now(),
  -- purchased_at + 24 months (REQUIREMENTS.md §9).
  expires_at              timestamptz not null,
  consumed_by_catalogue_id uuid references catalogues (id) on delete set null,
  consumed_at             timestamptz
);

create index if not exists credits_org_idx on credits (org_id, consumed_at, expires_at);

alter table credits enable row level security;
revoke all on credits from anon;
