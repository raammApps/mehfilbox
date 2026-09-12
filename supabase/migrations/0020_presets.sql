-- House styles (D-36, doc 16 §5, N-64).
--
-- A studio's named presets: the theme and layout a wedding starts from, the branding, the
-- language, and whether a guest code is on. Values are *copied* into a catalogue at creation —
-- `catalogues.preset_id` records which one — so editing a style never repaints a delivered
-- wedding, and a style a published catalogue references is frozen (the route refuses the edit and
-- offers a duplicate). The theme lives inside `branding` (`branding.theme`), as it does on a
-- catalogue, so one column carries the whole look.
create table if not exists presets (
  id          uuid primary key,
  org_id      uuid not null references orgs (id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  template_id text not null default 'keepsake',
  branding    jsonb not null default '{}'::jsonb,
  locale      text not null default 'en',
  passcode_on boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists presets_org_idx on presets (org_id);

alter table presets enable row level security;
revoke all on presets from anon;

-- Which look a wedding was created from. Kept when the style is deleted: the record is the point.
alter table catalogues add column if not exists preset_id uuid references presets (id) on delete set null;
create index if not exists catalogues_preset_idx on catalogues (preset_id) where preset_id is not null;
