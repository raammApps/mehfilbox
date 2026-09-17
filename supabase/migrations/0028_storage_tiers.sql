-- The storage ladder, sized per occasion (D-60, N-80). Coexists with the duration ladder
-- (Deliver/Keep/Cinema) rather than replacing it — a catalogue can carry both.
--
-- `plans` rows for Light/Medium/Heavy exist only so `entitlements.plan_id`'s foreign key has
-- something to point at. The application never reads this table: the tiers are defined once, in
-- code (`lib/entitlements.ts`'s `STORAGE_TIERS`), the same way the built-in themes are code and
-- not rows. `Custom` (100-300 GB) has no fixed number and is not seeded here — it is a "contact
-- us" note in the wizard, not a self-service row.
--
-- `price_paise` becomes nullable: these three are seeded before their prices are decided (D-60),
-- and 0 would misread as "free" rather than "not yet set."
alter table plans alter column price_paise drop not null;

insert into plans (id, kind, name, storage_gb, price_paise)
values
  ('light', 'catalogue', 'Light', 5, null),
  ('medium', 'catalogue', 'Medium', 50, null),
  ('heavy', 'catalogue', 'Heavy', 100, null)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  storage_gb = excluded.storage_gb;

-- `performance` and `event` — what Light is sized for. 0025 added the couple's two; this adds the
-- two the storage ladder needed or Light had nothing to be for.
alter table catalogues drop constraint if exists catalogues_occasion_check;
alter table catalogues add constraint catalogues_occasion_check
  check (occasion in (
    'wedding','engagement','anniversary','birthday','proposal',
    'baby-shower','naming-day','performance','event'
  ));
