-- N-84: a film's address stops being its upload filename forever.
--
-- The slug was set once, from the videographer's filename, at upload
-- (`app/api/admin/uploads/route.ts`), and renaming the title never touched it — so
-- `/watch/whatsapp-video-2026-08-12-at-02-07-21` stayed the address of a film an operator had
-- long since called "Sangeet". Not an access problem — the film behind it is still gated — but
-- it put the upload's own metadata in every link a guest forwarded.
--
-- `previous_slug` / `slug_changed_at` are how the fix stays honest to a link already sent: the
-- first rename after upload re-derives the slug from the new name (`resolveSlugChange` in
-- `app/api/admin/titles/[id]/route.ts`), and the old one keeps resolving for 90 days from
-- `slug_changed_at` (`app/c/[slug]/watch/[titleSlug]/page.tsx`) rather than dying the instant the
-- rename saves. `slug_changed_at` null means the slug is still exactly what upload derived from
-- the filename — the signal the rename handler uses to decide whether it may re-derive it at all;
-- once set, a further rename leaves the slug alone, because a link may already be in someone's
-- phone by then.

alter table titles
  add column if not exists previous_slug text,
  add column if not exists slug_changed_at timestamptz;
