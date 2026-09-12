-- Platform-authored themes (D-35, doc 16 §4).
--
-- The seven built-in themes live in code (`themes/registry.ts`); this table holds the ones a
-- platform admin adds from the console. Same token shape, validated for contrast on save, and
-- listed through the same resolver — a catalogue cannot tell which kind it is on.
--
-- A catalogue names its theme inside `branding` (`branding.theme`), so no column was added here:
-- the theme is a draft that reaches guests at Publish, exactly as the accent is.
create table if not exists themes (
  id          text primary key,
  name        text not null,
  description text not null default '',
  tokens      jsonb not null,
  -- Disabled hides it from pickers and keeps it for the catalogues already on it.
  enabled     boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table themes enable row level security;
revoke all on themes from anon;
