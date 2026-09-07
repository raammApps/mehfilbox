-- A studio chooses its language once, and its weddings inherit it (N-29).
--
-- Today `DEFAULT_LOCALE` is English for everyone, and the only way to Hindi is the guest toggle.
-- A Hindi-first studio in Jaipur therefore sets up every wedding in English and hopes the family
-- finds the switch — which is the wrong way round for the market this product is for.
--
-- Two columns rather than one: the org's is the studio's own preference, and the catalogue's is
-- copied from it at creation so changing the studio default later does not silently repaint
-- weddings that have already been delivered.
alter table orgs add column if not exists locale text not null default 'en'
  check (locale in ('en', 'hi'));
alter table catalogues add column if not exists locale text not null default 'en'
  check (locale in ('en', 'hi'));
