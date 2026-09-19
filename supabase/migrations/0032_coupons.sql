-- N-121, D-61 — coupon codes: a marketing cohort or a reward is a code, not a price change.
--
-- Three kinds. `percent` and `fixed` lower one checkout (N-20 charges what `applyCoupon` returns);
-- `reward` grants typed credits directly and needs no payment, so it is usable before N-20 exists.
-- A coupon is created and disabled in the platform console and NEVER deleted: a code somebody
-- redeemed is history, and its campaign label is how a cohort is read back a year later.

create table if not exists coupons (
  id               uuid primary key,
  -- Stored upper-case, so the unique index below is case-insensitive without a functional index and
  -- a typed "spring26" finds "SPRING26". Six to thirty-two characters, letters, digits and hyphens.
  code             text not null,
  kind             text not null,
  -- percent: 1..100. fixed: paise off, ex-GST. reward: how many credits.
  value            integer not null,
  -- Which basket a reward pays into. Null for the two discount kinds.
  reward_plan_id   text,
  -- The cohort this belongs to. Required: without it "who redeemed the spring campaign" is a guess.
  campaign         text not null,
  valid_from       timestamptz,
  valid_until      timestamptz,
  -- Null = no limit. `max_per_payer` defaults to one, because "one per studio" is the usual meaning
  -- of a code and a limit nobody set is how a promotion becomes a permanent discount.
  max_redemptions  integer,
  max_per_payer    integer default 1,
  -- Who may use it: a studio (org kind partner), a direct couple (org kind couple), or both.
  doors            text[] not null default '{studio,couple}',
  -- Which products (`plans.id`) a discount applies to; empty means any. Unused for a reward.
  plan_ids         text[] not null default '{}',
  active           boolean not null default true,
  created_by       text not null,
  created_at       timestamptz not null default now(),

  constraint coupons_code_shape check (code ~ '^[A-Z0-9][A-Z0-9-]{4,30}[A-Z0-9]$'),
  constraint coupons_kind_check check (kind in ('percent', 'fixed', 'reward')),
  constraint coupons_value_check check (value > 0),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 100),
  constraint coupons_reward_cap check (kind <> 'reward' or value <= 50),
  constraint coupons_reward_plan_check check (reward_plan_id is null or reward_plan_id in ('deliver', 'keep', 'cinema')),
  -- A reward names its basket and is for studios only (a direct couple has no basket, and a 100%
  -- discount already covers them); a discount names no basket.
  constraint coupons_reward_shape check (
    (kind = 'reward' and reward_plan_id is not null and doors = array['studio']::text[])
    or (kind <> 'reward' and reward_plan_id is null)
  ),
  constraint coupons_doors_check check (doors <@ array['studio', 'couple']::text[] and cardinality(doors) > 0),
  constraint coupons_window check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint coupons_limits_check check (
    (max_redemptions is null or max_redemptions > 0) and (max_per_payer is null or max_per_payer > 0)
  )
);

create unique index if not exists coupons_code_key on coupons (code);
create index if not exists coupons_campaign_idx on coupons (campaign);

create table if not exists coupon_redemptions (
  id               uuid primary key,
  -- No cascade: a coupon is never deleted, and a redemption must never be able to outlive its
  -- coupon's row or take it with it.
  coupon_id        uuid not null references coupons (id),
  payer_org_id     uuid not null references orgs (id) on delete cascade,
  -- The payment this discounted. Null for a reward (nothing was paid) and, until N-20 creates the
  -- `payments` table, for everything — deliberately no foreign key to a table that does not exist.
  payment_id       uuid,
  -- What was taken off a checkout, in paise; zero for a reward.
  amount_off_paise integer not null default 0 check (amount_off_paise >= 0),
  -- How many credits a reward handed over; zero for a discount.
  credits_granted  integer not null default 0 check (credits_granted >= 0),
  created_at       timestamptz not null default now()
);

create index if not exists coupon_redemptions_coupon_idx on coupon_redemptions (coupon_id, created_at);
create index if not exists coupon_redemptions_payer_idx on coupon_redemptions (payer_org_id, coupon_id);

-- Service role only, like every table since 0002. The anon key is printed into every page; nothing
-- client-side has any business reading a code that is worth money.
alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
revoke all on coupons from anon;
revoke all on coupon_redemptions from anon;

-- One atomic step for "may this be redeemed, and if so record it and hand over what it grants".
--
-- The row is locked first (`for update`), so two people redeeming the last of a limited code — or
-- one payer sending the same request twice at once — are serialised: the second sees the first's
-- redemption when it counts. Counting without the lock lets both pass. Validity is checked here as
-- well as in the application because the application's check is a read and this is the decision.
--
-- Returns the redemption id, or null when it may not be redeemed (unknown, disabled, outside its
-- window, or a limit reached) — one answer for all of them, on purpose. Credits, if any, are inserted
-- in the same transaction: a redemption with no credits, or credits with no redemption, cannot exist.
create or replace function redeem_coupon(
  p_id uuid,
  p_coupon uuid,
  p_payer uuid,
  p_payment uuid,
  p_amount_off integer,
  p_credits jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  c coupons%rowtype;
  total integer;
  mine integer;
begin
  select * into c from coupons where id = p_coupon for update;
  if not found or not c.active then
    return null;
  end if;
  if c.valid_from is not null and p_now < c.valid_from then
    return null;
  end if;
  if c.valid_until is not null and p_now > c.valid_until then
    return null;
  end if;
  if c.max_redemptions is not null then
    select count(*) into total from coupon_redemptions where coupon_id = c.id;
    if total >= c.max_redemptions then
      return null;
    end if;
  end if;
  if c.max_per_payer is not null then
    select count(*) into mine from coupon_redemptions where coupon_id = c.id and payer_org_id = p_payer;
    if mine >= c.max_per_payer then
      return null;
    end if;
  end if;

  insert into coupon_redemptions (id, coupon_id, payer_org_id, payment_id, amount_off_paise, credits_granted, created_at)
  values (p_id, c.id, p_payer, p_payment, p_amount_off, jsonb_array_length(coalesce(p_credits, '[]'::jsonb)), p_now);

  insert into credits (id, org_id, plan_id, granted_by, reason, purchased_at, expires_at)
  select (x->>'id')::uuid, p_payer, x->>'plan_id', x->>'granted_by', x->>'reason',
         (x->>'purchased_at')::timestamptz, (x->>'expires_at')::timestamptz
  from jsonb_array_elements(coalesce(p_credits, '[]'::jsonb)) x;

  return p_id;
end;
$$;

-- Only the service role may run it: the function moves credits, and Supabase exposes every public
-- function to the anon key unless it is told otherwise.
revoke execute on function redeem_coupon(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function redeem_coupon(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) to service_role;
