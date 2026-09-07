-- Every message the application sends, queued and recorded (N-50).
--
-- Two jobs in one table, deliberately. It is the **queue** — a row is written by whatever decides
-- a message is due, and drained by `/api/cron/notify` — and it is the **record**: what was sent,
-- to whom, in which language, over which channel, and what the provider said. `PRICING.md` §2
-- requires the second; the first is why a guest request never waits on an email.
--
-- A queue rather than a direct send because delivery is slow and fallible, and the request that
-- decides a message is due is usually one a person is waiting on. It also makes a retry a row
-- update rather than a lost message.
create table if not exists notifications (
  id            uuid primary key,
  template      text not null,
  channel       text not null check (channel in ('email', 'whatsapp', 'sms')),
  address       text not null,
  locale        text not null default 'en' check (locale in ('en', 'hi')),
  -- Rendered at enqueue time, not at send time. The catalogue may lapse, be renamed, or be handed
  -- over between the two, and a warning that describes a state the couple has already left is
  -- worse than a late one.
  subject       text not null,
  body_text     text not null,
  body_html     text,
  -- Nullable: a message may concern an org with no catalogue, or neither.
  org_id        uuid references orgs(id) on delete cascade,
  catalogue_id  uuid references catalogues(id) on delete cascade,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider      text,
  provider_id   text,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- The drain query: oldest queued first. Partial, because `sent` rows are the vast majority and
-- the queue never wants to read them.
create index if not exists notifications_queued_idx
  on notifications (created_at) where status = 'queued';

-- "What did this couple receive" — the question `PRICING.md` §2 asks.
create index if not exists notifications_catalogue_idx on notifications (catalogue_id, created_at);

-- RLS as on every other table (0002): the service-role key bypasses it, the anon key is public
-- and must never read a queue that holds addresses.
alter table notifications enable row level security;
