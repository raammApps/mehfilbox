-- Two doors, one credential store (D-33, D-34, N-61).
--
-- A credential link is a single-use, expiring, hashed token that lets its holder set a password —
-- the forgot-password flow, and the way a studio hands a couple their first sign-in without a
-- password ever travelling through WhatsApp. It works identically on both auth drivers, because
-- the link is ours and only the final "set the password" step touches the authenticator.
--
-- Stored hashed like a transfer token (0005): a leaked table must not hand somebody a working
-- sign-in for every account mid-reset.
create table if not exists credential_links (
  id           uuid primary key,
  operator_id  uuid not null references operators (id) on delete cascade,
  token_hash   text not null,
  -- `set-password` is a first credential (a new studio operator, a couple the studio created);
  -- `reset` is a replacement. The pages read the same; the audit trail does not.
  purpose      text not null check (purpose in ('set-password', 'reset')),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists credential_links_token_idx on credential_links (token_hash);
create index if not exists credential_links_operator_idx on credential_links (operator_id, created_at desc);

-- A temporary password shown once to a studio in the room with the couple has to be replaced at
-- the couple's first sign-in; this is what the session route reads to send them there.
alter table operators add column if not exists must_change_password boolean not null default false;

-- RLS as on every table since 0002: service role only, nothing for anon.
alter table credential_links enable row level security;
revoke all on credential_links from anon;
