-- ─────────────────────────────────────────────────────────────────────────────
-- 0029 — the price list (N-118, D-61)
--
-- `plans` becomes the platform's price list: every product the platform sells and what it costs
-- today, edited in the platform console rather than in code. Nothing anywhere reads a rupee figure
-- from a source file any more; this migration holds only the INITIAL values, from `docs/PRICING.md`.
--
-- **Re-running this is safe and never undoes an edit.** The seed is `on conflict (id) do update`,
-- but the update touches only structure (kind, name, unit, storage, position) — never `price_paise`,
-- `grants` or the suggested-retail range, which are exactly what an admin edits. A price changed in
-- the console survives a re-applied migration.
--
-- Prices are whole paise, **ex-GST**, as `PRICING.md` quotes them. `null` means "not for sale".
-- ─────────────────────────────────────────────────────────────────────────────

-- The seed needs kinds the first version of this table did not: a renewal, an archive and an
-- add-on are things a catalogue buys after it exists, and each is fulfilled differently (N-20).
alter table plans drop constraint if exists plans_kind_check;
alter table plans
  add constraint plans_kind_check
  check (kind in ('partner', 'catalogue', 'renewal', 'archive', 'addon'));

-- What one price buys: a purchase, a year, a GB-month, twenty minutes of 4K. Without it "25" on an
-- admin's screen is a number, not a price.
alter table plans add column if not exists unit text not null default 'each';

-- The typed credit bundle a purchase grants, `{"deliver": 2, "cinema": 1}` — only the Studio plan
-- has one. `catalogue_credits` (one integer) cannot say WHICH credit, and D-61 makes credits typed.
alter table plans add column if not exists grants jsonb not null default '{}'::jsonb;

-- Reading order in the console. Not a price, so a re-applied migration may reset it.
alter table plans add column if not exists position integer not null default 100;

-- What studios typically charge a couple — advisory copy on the marketing page, not a price we
-- bill. It is a setting anyway, so that no rupee figure has to live in a source file.
alter table plans add column if not exists retail_min_paise integer;
alter table plans add column if not exists retail_max_paise integer;
alter table plans drop constraint if exists plans_retail_range;
alter table plans
  add constraint plans_retail_range
  check (retail_min_paise is null or retail_max_paise is null or retail_min_paise <= retail_max_paise);

-- Column order: id, kind, name, unit, price_paise, storage_gb, grants, position, retail_min, retail_max.
-- One row per line, exactly this shape: tests/unit/price-list-seed.test.ts reads this file and
-- fails if `lib/db/seed-data.ts`'s SEED_PLANS ever drifts from it.
insert into plans (id, kind, name, unit, price_paise, storage_gb, grants, position, retail_min_paise, retail_max_paise)
values
  ('studio', 'partner', 'Studio plan', 'year', 499900, null, '{"deliver":2,"cinema":1}', 10, null, null),
  ('deliver', 'catalogue', 'Deliver', 'each', 199900, 100, '{}', 20, 500000, 800000),
  ('deliver-5', 'catalogue', 'Deliver — five credits', 'each', 799900, 100, '{}', 25, null, null),
  ('keep', 'catalogue', 'Keep', 'each', 600000, 100, '{}', 30, 1500000, 2000000),
  ('keep-3y', 'catalogue', 'Keep — three years', 'each', 1200000, 100, '{}', 35, null, null),
  ('cinema', 'catalogue', 'Cinema', 'each', 1200000, 200, '{}', 40, 3000000, 4000000),
  ('cinema-3y', 'catalogue', 'Cinema — three years', 'each', 2400000, 200, '{}', 45, null, null),
  ('light', 'catalogue', 'Light', 'each', null, 5, '{}', 50, null, null),
  ('medium', 'catalogue', 'Medium', 'each', null, 50, '{}', 55, null, null),
  ('heavy', 'catalogue', 'Heavy', 'each', null, 100, '{}', 60, null, null),
  ('renewal-keep', 'renewal', 'Keep renewal', 'year', 250000, null, '{}', 70, null, null),
  ('renewal-cinema', 'renewal', 'Cinema renewal', 'year', 400000, null, '{}', 75, null, null),
  ('archive-keep', 'archive', 'Archive — Keep', 'year', 99900, null, '{}', 80, null, null),
  ('archive-cinema', 'archive', 'Archive — Cinema', 'year', 149900, null, '{}', 85, null, null),
  ('archive-keep-5y', 'archive', 'Long-term archive — Keep, five years', 'each', 399900, null, '{}', 90, null, null),
  ('archive-keep-10y', 'archive', 'Long-term archive — Keep, ten years', 'each', 699900, null, '{}', 95, null, null),
  ('archive-cinema-5y', 'archive', 'Long-term archive — Cinema, five years', 'each', 599900, null, '{}', 100, null, null),
  ('upgrade-deliver-keep', 'addon', 'Deliver → Keep upgrade', 'each', 250000, null, '{}', 110, null, null),
  ('extra-storage', 'addon', 'Extra storage', 'gb_month', 2500, null, '{}', 120, null, null),
  ('extra-4k', 'addon', 'Extra 4K', 'min4k_20', 199900, null, '{}', 130, null, null)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  unit = excluded.unit,
  storage_gb = excluded.storage_gb,
  position = excluded.position;

-- RLS has been on since 0006 with no policy for anon, which is default-deny. Now that the table
-- holds live prices an explicit revoke is worth having as well: the same belt and braces every
-- later table got, so a future policy added here by mistake still meets a role with no grant.
revoke all on plans from anon;
