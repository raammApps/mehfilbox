-- Custom domains (doc 16 §1, N-68).
--
-- A studio serves its catalogues from its own domain (`catalogue_id` null: films.kalyanam.in/<wedding>);
-- a couple serves one catalogue from theirs (`catalogue_id` set: aanyaandvikram.in). The row moves
-- pending → verified (DNS proved ownership and pointing) → active (attached to the host and
-- issued a certificate), or failed; `last_checked_at` and `error` are what the console shows.
create table if not exists domains (
  id                 uuid primary key,
  org_id             uuid not null references orgs (id) on delete cascade,
  catalogue_id       uuid references catalogues (id) on delete cascade,
  host               text not null unique,
  verification_token text not null,
  status             text not null default 'pending',
  last_checked_at    timestamptz,
  error              text,
  created_at         timestamptz not null default now()
);

create index if not exists domains_org_idx on domains (org_id);
create index if not exists domains_status_idx on domains (status);

alter table domains enable row level security;
revoke all on domains from anon;

-- The absolute address a catalogue is served from once a domain is active — `https://aanyaandvikram.in`
-- or `https://films.kalyanam.in/aanya-vikram-2026`. Stamped on activation and cleared on removal,
-- so every URL the product prints reads one column. `custom_domain` (0003) is superseded by it.
alter table catalogues add column if not exists served_at text;
create index if not exists catalogues_served_at_idx on catalogues (served_at) where served_at is not null;
