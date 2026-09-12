-- Couple accounts, linked before owned, and the studio's way back in (D-37, doc 16 §3, N-62).
--
-- `couple_org_id` names the couple's account from the moment the studio creates it. Until the
-- handover the studio owns the row (`org_id`) and the couple sees it in their account as "being
-- prepared by <studio>"; at handover `org_id` moves and this column keeps saying who it was for.
--
-- `support_access_until` is the second — and last — authorisation path in the product: after a
-- handover the originating studio may open the customizer for a fix while the couple's window is
-- open, and it closes on its own. Read in exactly one place, `lib/admin/session.ts`.
--
-- `passcode_version` is what makes changing the guest code sign out everyone who held the old one
-- (N-71): the grant cookie carries the version it was issued under, and a mismatch is a miss.
alter table catalogues add column if not exists couple_org_id uuid references orgs (id) on delete set null;
alter table catalogues add column if not exists support_access_until timestamptz;
alter table catalogues add column if not exists passcode_version integer not null default 1;

create index if not exists catalogues_couple_org_idx on catalogues (couple_org_id) where couple_org_id is not null;
