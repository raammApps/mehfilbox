-- Branding becomes draft-until-published, like sections already were (N-56).
--
-- `draft_modules` has always held layout changes back until an explicit Publish, but branding —
-- colour, logo, typeface, "Presented by" — was written straight onto the live row, so a studio
-- trying a colour changed the couple's page while they were still choosing. Two save models on
-- one screen, and the more visible half was the one with no gate.
--
-- Mirrors `draft_modules` exactly: null means "nothing pending", Publish promotes and clears.
alter table catalogues add column if not exists draft_branding jsonb;
