-- Films and photographs wait for Publish, like sections and branding already do (N-57).
--
-- Ticking "published" on a film made it visible to the couple immediately, and a photograph was
-- visible the moment it finished uploading. Sections have always waited in `draft_modules` and
-- branding waits in `draft_branding` (0011), so the same wedding page had three different answers
-- to "when does the couple see this".
--
-- `live_at` is when the row was last carried live by a catalogue Publish. Null means the guest
-- does not see it, whatever else is true of the row.
alter table titles add column if not exists live_at timestamptz;
alter table photos add column if not exists live_at timestamptz;

create index if not exists titles_live_idx on titles (catalogue_id) where live_at is not null;

-- **The backfill is the whole risk of this migration.** Without it every catalogue already
-- delivered goes dark the moment this deploys: every film and photograph would have a null
-- `live_at` and disappear from the guest page of a wedding somebody has already been given.
--
-- What is live today is exactly `published = true` for films, and every photograph, so that is
-- what is marked. `created_at` rather than `now()`, so the column reads as history rather than
-- claiming every wedding was published the day this ran.
update titles set live_at = created_at where live_at is null and published = true;
update photos set live_at = now() where live_at is null;
