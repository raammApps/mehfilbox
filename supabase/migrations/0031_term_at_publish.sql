-- N-120, D-61 — a wedding's term starts at its first Publish, and its length comes from its plan.
--
-- Until now `included_until` was set when a catalogue was CREATED, a flat twelve months, before
-- anything had been delivered: a wedding built over three months spent a quarter of its term as a
-- draft, and Deliver's 90 days could not be expressed at all. Now the column is empty until the
-- first Publish, and the length is a setting on the plan row rather than a constant in code.

-- 1. A plan's term. At most one of the two is set, because "12 months" is calendar months and
--    "90 days" is days and the two are not interchangeable (a wedding published on 1 March of a
--    leap year is served to 1 March, not 365 days later). A plan with neither has no term.
alter table plans add column if not exists term_months integer;
alter table plans add column if not exists term_days integer;
alter table plans drop constraint if exists plans_term_check;
alter table plans
  add constraint plans_term_check
  check (
    (term_months is null or term_months > 0)
    and (term_days is null or term_days > 0)
    and (term_months is null or term_days is null)
  );

-- The lengths D-61 states: Deliver 90 days, Keep and Cinema twelve months. Only where nothing is set
-- yet, so re-running this can never undo a term someone has changed since.
update plans set term_days = 90
  where id = 'deliver' and term_days is null and term_months is null;
update plans set term_months = 12
  where id in ('keep', 'cinema') and term_days is null and term_months is null;

-- 2. A catalogue may have no term yet. `null` means "not started", never "expired" — every reader
--    treats it as no date at all.
alter table catalogues alter column included_until drop not null;

-- 3. Weddings that were created but never published have not started their term, whatever the old
--    creation-time date says: leaving it would have a draft made eleven months ago lapse a month
--    after it first goes live. STATED, not assumed: this is the only row this touches, and it only
--    touches a draft that has never been published. Every catalogue that has ever been published
--    (published_at is set, which survives an unpublish) keeps the date it has — a term is never
--    restarted.
update catalogues
  set included_until = null
  where published_at is null and status = 'draft' and included_until is not null;
