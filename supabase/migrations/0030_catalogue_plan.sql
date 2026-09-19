-- ─────────────────────────────────────────────────────────────────────────────
-- 0030 — a wedding's plan, and typed credits (N-119, D-61)
--
-- A credit is typed to a plan (Deliver, Keep, Cinema) and a first publish spends one of the plan the
-- wedding is on. `credits.plan_id` has existed since 0021 and nothing read it; this gives the
-- wedding the other half — the plan it is on — so the two can finally be matched.
--
-- **The backfill, stated rather than assumed:** every existing catalogue takes `deliver`, through
-- the column default. That is right because every credit ever granted defaulted to `deliver`
-- (`makeCredits` is the only writer and never passed anything else) — so the wedding a credit
-- paid for was, in effect, a Deliver wedding, and a published one keeps matching the credit it
-- spent. It is not a claim about what the studio charged its couple.
--
-- `plans` is not referenced: `plans` holds things a wedding is not on (the Studio plan, a renewal),
-- and a foreign key would let a catalogue point at one. The check below is the list of plans a
-- credit can be for, and it is kept equal to `CREDIT_PLAN_IDS` in `lib/plans.ts` by
-- `tests/unit/typed-credits-migration.test.ts`.
-- ─────────────────────────────────────────────────────────────────────────────

alter table catalogues add column if not exists plan_id text not null default 'deliver';

alter table catalogues drop constraint if exists catalogues_plan_id_check;
alter table catalogues
  add constraint catalogues_plan_id_check
  check (plan_id in ('deliver', 'keep', 'cinema'));

-- A credit typed to a plan that does not exist could never be spent, and nothing would say why.
-- Neither project has a credit row yet (checked 19 September), so this cannot reject existing data.
alter table credits drop constraint if exists credits_plan_id_check;
alter table credits
  add constraint credits_plan_id_check
  check (plan_id in ('deliver', 'keep', 'cinema'));

-- Publishing looks for the soonest-expiring unspent credit *of one plan* for one org.
create index if not exists credits_org_plan_idx on credits (org_id, plan_id, consumed_at, expires_at);
