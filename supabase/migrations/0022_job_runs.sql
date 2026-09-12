-- Scheduled jobs leave a record (D-40, doc 16 §9, N-67).
--
-- Every cron writes one row per run: when it started and finished, whether it succeeded, and the
-- counts it reported. The platform health page reads the newest row per job, which turns "did
-- the drain run last night" from a log search into a sentence.
create table if not exists job_runs (
  id          uuid primary key,
  job         text not null,
  started_at  timestamptz not null,
  finished_at timestamptz not null,
  ok          boolean not null,
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists job_runs_job_idx on job_runs (job, finished_at desc);

alter table job_runs enable row level security;
revoke all on job_runs from anon;
