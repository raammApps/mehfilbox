-- The tenant is in the path (D-32, N-60).
--
-- A catalogue's public address becomes `mehfilbox.com/<studio>/<wedding>`. The studio segment is
-- frozen on the catalogue rather than joined from `orgs` at render time, and that is deliberate:
-- the address is in two hundred phones the day it is sent, and it must not change because a studio
-- renamed itself or because a handover moved the row to the couple. What a guest typed in must
-- keep working, which means what a guest typed in has to be a property of the wedding.
--
-- Re-runnable, like every migration here.
alter table catalogues add column if not exists tenant_slug text;

-- Every existing catalogue was created by the org that originated it (0004 backfilled
-- origin_org_id from org_id), so the studio segment is that org's slug.
update catalogues c
   set tenant_slug = o.slug
  from orgs o
 where o.id = coalesce(c.origin_org_id, c.org_id)
   and c.tenant_slug is null;

-- Belt and braces for a row whose origin org has been deleted: the current owner's slug.
update catalogues c
   set tenant_slug = o.slug
  from orgs o
 where o.id = c.org_id
   and c.tenant_slug is null;

alter table catalogues alter column tenant_slug set not null;

-- The guest lookup is still by `slug` alone (globally unique); this index serves the console's
-- "every catalogue under this studio segment" reads and nothing on the hot path.
create index if not exists catalogues_tenant_slug_idx on catalogues (tenant_slug);
