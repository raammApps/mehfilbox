-- ═══════════════════════════════════════════════════════════════════════════════
-- Mehfilbox — initial schema (doc 06 §1 + doc 14 §6)
--
-- Isolation is enforced in two places and both matter: RLS here, and org-scoped queries in
-- lib/admin/session.ts. Every data-layer change answers "what enforces isolation here?"
-- (doc 10 §5).
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Tenancy ────────────────────────────────────────────────────────────────────
create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  branding    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table operators (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  email         text unique not null,
  name          text not null,
  role          text not null default 'admin' check (role in ('admin','uploader')),
  -- Populated only when running without Supabase Auth (self-hosted / local). Supabase Auth
  -- owns the credential in the managed path; this column stays null there.
  password_hash text,
  created_at    timestamptz not null default now()
);

create index on operators (org_id);

-- ── The wedding ────────────────────────────────────────────────────────────────
create table catalogues (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  slug          text unique not null,
  custom_domain text unique,

  couple_name   jsonb not null,
  app_name      jsonb not null,
  wedding_date  date not null,
  city          jsonb,
  synopsis      jsonb,

  occasion      text not null default 'wedding'
                check (occasion in ('wedding','anniversary','proposal','birthday','engagement')),

  branding          jsonb not null default '{}',
  featured_title_id uuid,

  -- jsonb rather than a table: module instances are always read as a whole list for one
  -- catalogue, never queried across catalogues, and their shape varies per type (doc 14 §6).
  modules       jsonb not null default '[]',
  draft_modules jsonb,
  template      text,

  status        text not null default 'draft'
                check (status in ('draft','published','archived')),
  privacy       text not null default 'unlisted'
                check (privacy in ('unlisted','passcode')),
  passcode_hash text,

  included_until timestamptz not null,
  sub_status    text not null default 'included'
                check (sub_status in ('included','active','grace','lapsed','cold','deleted')),
  sub_plan      text check (sub_plan in ('monthly','yearly')),
  sub_until     timestamptz,

  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create index on catalogues (org_id, created_at desc);

-- ── Content ────────────────────────────────────────────────────────────────────
create table titles (
  id            uuid primary key default gen_random_uuid(),
  catalogue_id  uuid not null references catalogues(id) on delete cascade,
  slug          text not null,

  name          jsonb not null,
  synopsis      jsonb,
  category      text not null check (category in (
                  'highlights','pre_wedding','mehendi','haldi','sangeet','ceremony',
                  'reception','full_films','aerial','guest_wishes','behind_scenes')),
  credits       jsonb not null default '[]',

  provider      text not null default 'bunny',
  provider_id   text,
  duration_s    int,
  poster_url    text,
  poster_candidates jsonb not null default '[]',
  poster_source text default 'auto' check (poster_source in ('auto','custom','generated')),
  thumbnails_url text,
  trailer_url   text,
  captions      jsonb not null default '[]',

  status        text not null default 'uploading'
                check (status in ('uploading','processing','ready','failed')),
  error_message text,

  published     boolean not null default false,
  sort_order    int not null default 0,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),

  view_count    int not null default 0,
  watch_seconds bigint not null default 0,

  unique (catalogue_id, slug)
);

create index on titles (catalogue_id, published, category, sort_order);
create index on titles (catalogue_id, published_at desc);
create index on titles (provider_id);
-- The reconciliation job's query: anything stuck in `processing` for over two hours.
create index on titles (status, created_at) where status = 'processing';

alter table catalogues
  add constraint catalogues_featured_title_fk
  foreign key (featured_title_id) references titles(id) on delete set null;

create table albums (
  id           uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references catalogues(id) on delete cascade,
  name         jsonb not null,
  created_at   timestamptz not null default now()
);

create index on albums (catalogue_id);

create table photos (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references albums(id) on delete cascade,
  url        text not null,
  lqip       text,
  caption    jsonb,
  width      int,
  height     int,
  sort_order int not null default 0
);

create index on photos (album_id, sort_order);

-- ── Viewers ────────────────────────────────────────────────────────────────────
-- Guests never authenticate. A profile is a *label*, not a person (doc 06 §5) — which is what
-- keeps the whole viewer side of the product free of personal data.
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references catalogues(id) on delete cascade,
  label        text not null check (label in ('Bride''s side','Groom''s side','Friends','Family')),
  avatar_seed  text not null,
  created_at   timestamptz not null default now()
);

create index on profiles (catalogue_id);

create table playback_progress (
  profile_id uuid not null references profiles(id) on delete cascade,
  title_id   uuid not null references titles(id) on delete cascade,
  position_s int  not null default 0,
  duration_s int  not null,
  completed  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, title_id)
);

create table module_state (
  profile_id uuid not null references profiles(id) on delete cascade,
  module_id  text not null,
  state      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (profile_id, module_id)
);

-- ── Ops ────────────────────────────────────────────────────────────────────────
create table play_events (
  id           bigserial primary key,
  catalogue_id uuid not null references catalogues(id) on delete cascade,
  title_id     uuid not null references titles(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete set null,
  seconds      int not null,
  at           timestamptz not null default now()
);

create index on play_events (catalogue_id, at desc);

create table usage_rollup (
  catalogue_id uuid not null references catalogues(id) on delete cascade,
  month        date not null,
  stored_gb    numeric(10,3) not null default 0,
  delivered_gb numeric(10,3) not null default 0,
  primary key (catalogue_id, month)
);

-- ── Functions the repository calls ─────────────────────────────────────────────

-- A reorder must be atomic: a half-applied order is visible to guests (doc 07).
create or replace function reorder_titles(p_catalogue_id uuid, p_order jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update titles t
     set sort_order = (o->>'sort_order')::int
    from jsonb_array_elements(p_order) o
   where t.id = (o->>'id')::uuid
     and t.catalogue_id = p_catalogue_id;
end;
$$;

-- One statement for the append and the counter, so a heartbeat cannot half-apply.
create or replace function record_play_event(
  p_catalogue_id uuid,
  p_title_id uuid,
  p_profile_id uuid,
  p_seconds int
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into play_events (catalogue_id, title_id, profile_id, seconds)
  values (p_catalogue_id, p_title_id, p_profile_id, p_seconds);

  update titles
     set watch_seconds = watch_seconds + p_seconds
   where id = p_title_id;
end;
$$;
