-- A durable rate limiter (N-86, doc 05 §4's "5 attempts then a 15-minute lockout").
--
-- `lib/http/rate-limit.ts` has been process memory since Phase 0, and said so in its own
-- comment: on one Vercel instance the budget is exact, on N instances it is N times looser,
-- because a lockout on one instance is unknown to the others. Ten-plus routes lean on it —
-- sign-in, registration, forgot-password, the guest code, the playback token, profiles — and
-- with `CAPTCHA_DRIVER=none` in production this table is the only thing standing between a
-- script and a four-digit code, not a second layer over one.
--
-- One row per bucket key, and the whole "consume" operation happens in `consume_rate_limit`
-- below as a single atomic upsert — never a read here, a decision in the app, a write there,
-- which is exactly the shape that lets two concurrent requests from the same address both see
-- "allowed" right as a lockout should begin.
create table if not exists rate_limits (
  key        text primary key,
  count      integer not null,
  reset_at   timestamptz not null
);

alter table rate_limits enable row level security;
-- Service role only, like every other table since 0002: nothing client-side has any business
-- reading or writing a bucket, and the anon key never reaches this table at all.
revoke all on rate_limits from anon;

-- One statement for "consume", so the read, the reset-or-increment decision, and the write are
-- one atomic operation under Postgres's own row-level locking — `insert ... on conflict do
-- update ... returning` serialises concurrent callers correctly with no advisory lock needed.
create or replace function consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_s int
)
returns table(count int, reset_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  insert into rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + (p_window_s || ' seconds')::interval)
  on conflict (key) do update
    set count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now() then now() + (p_window_s || ' seconds')::interval else r.reset_at end
  returning r.count, r.reset_at;
end;
$$;

-- Nothing calls this yet — deliberately deferred rather than bolted onto an unrelated cron's
-- alerting semantics (`reconcile` alerts specifically on a broken webhook; this is a different
-- concern). One row per distinct key ever seen (an email, an IP, a catalogue slug), so growth is
-- slow and each row tiny — the same "low priority, revisit before it is a problem" call this
-- codebase already made for `play_events`. Provided now so wiring it in later is a one-line
-- `await repository.rpc(...)` in whichever job picks it up, not a new function to write.
create or replace function delete_expired_rate_limits()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from rate_limits where reset_at < now() - interval '1 day';
end;
$$;
