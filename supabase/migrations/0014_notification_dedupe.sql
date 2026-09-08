-- One message per milestone per catalogue, enforced by the database (N-21).
--
-- The warning schedule is 60 / 30 / 7 / 1 days before a catalogue lapses and 30 / 60 / 89 days
-- into grace. A cron computes those from a date, so it re-derives the same milestone on every run
-- until the day passes — a schedule that can double-send is worse than no schedule, because the
-- couple learns to ignore it and then misses the one that mattered.
--
-- The key is `<template>:<catalogue>:<milestone>`, and the uniqueness is a **constraint** rather
-- than a check in application code: two overlapping cron runs cannot both pass a read-then-write,
-- and this is the one place that can actually promise it.
alter table notifications add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_key_idx
  on notifications (dedupe_key) where dedupe_key is not null;
