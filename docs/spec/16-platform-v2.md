# 16 — The platform, second pass (12 September 2026)

**What changed, why, and what it means for the code.** Written from Sandeep's list of 12
September, the Claude Design prototype (`Mehfilbox Prototype`, 16 screens), and a read of every
document and surface in this repository as it stood that morning. It is the specification for the
work recorded as **N-60 to N-75** in `NEXT.md`, and it supersedes doc 02 §1 (addressing), doc 15
§1–§2 (accounts and handover) and doc 14 §5's "Theme customisation, safely" wherever they disagree.

> **Status, 12 September 2026, end of day: built.** N-60 to N-75 all landed the same day —
> §1 as N-60 and N-68, §2 as N-61, §3 and §6 as N-62 and N-73, §4 as N-63, §5 as N-64, §7 as
> N-65, §8 as N-66, §9 as N-67, §10 as N-69 and N-72, §12 as N-70, the rest as N-75. Each is a
> `PROGRESS.md` entry; what a section says and what shipped differ only where the entry says so
> (the prototype's arithmetic captcha was not built; the term moved to the platform; a couple's
> own catalogue uses the studio's wizard in a second shape). Migrations 0016–0025.

Everything here follows the two rules that have kept the codebase coherent: **one isolation
mechanism** (`org_id` from the session, never from a request) and **a seam for every external
service** (a fake driver in the suite, a real one in production). Nothing below adds a third way
to ask "may I see this".

---

## 0. The product, restated

Four surfaces on one codebase:

| Surface | Who | Where |
|---|---|---|
| **Public site** | Studios who might sign up; couples who sign in | `mehfilbox.com` |
| **Guest catalogue** | Two hundred people from a WhatsApp link, no account | `mehfilbox.com/<studio>/<wedding>` or the studio's own domain |
| **Studio console** | The provider — a studio, planner or photographer, with a team | `/admin` |
| **Couple's account** | The client, with one or many catalogues, from one or many studios | `/my` |
| **Platform console** | Us | `/admin/platform` |

A studio signs up, gets its first wedding free, builds a catalogue with the couple in the room —
theme, layout, language, guest code, the couple's own sign-in — publishes, and sends one link.
The couple signs in with what the studio gave them, changes the code or the password whenever they
like, and can start a second catalogue of their own for the anniversary. The platform sees every
studio, every catalogue, every service it depends on, and can create, suspend, credit and repair
any of them with a record of having done so.

---

## 1. Addressing — the tenant is in the path

**Decided (D-32):** a catalogue's public address is `https://mehfilbox.com/<studio>/<wedding>`.
No subdomain per wedding, no wildcard certificate, one domain to protect.

- `<studio>` is the **originating org's slug** (`catalogues.origin_org_id`), which never changes —
  not the current owner's. A handover moves control to the couple; it must not move the link that
  is already in two hundred phones.
- `<wedding>` stays **globally unique** (N-32's year suffix and disambiguation stand). The tenant
  segment is therefore verified rather than resolved: a request for `/<other-studio>/<wedding>`
  is answered with a 301 to the canonical address, never with a different studio's page.
- `/c/<wedding>` remains the internal route every guest page renders on, and a **legacy alias**:
  a request that arrives at it from outside 301s to the canonical form, so links sent before this
  change keep working.
- Guest-internal paths (`/watch/<title>`, `/locked`, `/renew`, `/download`) hang off the canonical
  base. `cataloguePath` and `catalogueUrl` in `lib/tenant.ts` remain the only place that knows
  this, and both now take the origin slug.
- `TENANCY_MODE=subdomain` is **retired as a product mode**. It stays as configuration because the
  Playwright harness boots two servers and the subdomain one is still the cheaper way to run a
  catalogue at a root, but nothing is sold on it and no document may describe a subdomain address
  again.

### Custom domains, and the instructions that go with them

A studio can serve its catalogues from its own domain; a couple can serve one catalogue from
theirs. One table (`domains`) carries both:

| Column | |
|---|---|
| `org_id` | The studio (a studio domain) |
| `catalogue_id` | Set for a single-catalogue domain, null for a studio domain |
| `host` | `films.kalyanam.in` or `aanyaandvikram.in`, bare and lowercased |
| `verification_token` | Random; expected in a TXT record at `_mehfilbox.<host>` |
| `status` | `pending` → `verified` (DNS proves ownership) → `active` (attached and issued) · `failed` |
| `last_checked_at`, `error` | So the console can say what it saw |

What the console shows is **generated from what was typed**:

- a **subdomain** (`films.kalyanam.in`) gets a CNAME to `cname.mehfilbox.com` plus the TXT record;
- a **root domain** (`aanyaandvikram.in`) gets an A record to the platform address plus a `www`
  CNAME, with a warning that a root domain usually carries the family's email and that the MX
  records must not be touched;
- a **nameserver handover** option for the studio that would rather delegate the whole domain.

Every record is shown with copy buttons and the exact values — host, target, token — and a
per-registrar hint (Hostinger, GoDaddy, Namecheap, Cloudflare). **"Check DNS"** resolves the TXT
and the CNAME/A from the server (`node:dns`) and moves the row to `verified`; attachment and
certificate issue go through a `DomainProvider` seam (`fake` in the suite; `vercel` when
`VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` are configured, so the row reaches `active` without a
person). When the provider is not configured the row waits at `verified` and the platform console
lists it under *domains awaiting attachment* — honest, rather than a status that says "active"
about a domain nobody attached.

Once `active`, the mehfilbox path **301s to the custom domain**, so links already sent survive,
and every URL the product generates for that catalogue (share, OG, delivery message) uses it.

---

## 2. Accounts — two doors, one credential store

**Decided (D-33):** one sign-in page at `/login` with two doors, **Studio** and **Couple**. Both
post to the same session route; which console they land in is decided by the org's `kind`, read
from the `operators` row — never from the door they picked. A couple who picks the studio door by
mistake still ends up in their own account.

- `/admin/login` redirects to `/login?door=studio`. Every link in the product that used to say
  "Create a partner account" goes through the public site.
- **Forgot password** exists on both doors and answers the same neutral sentence whether or not
  the address is known. It emails a single-use **credential link** (`/set-password/<token>`),
  hashed in `credential_links`, valid for one hour, which sets the password through the auth
  seam (`AuthProvider.setPassword`) — so it works on the local driver and on Supabase Auth
  identically, and never depends on Supabase's own email templates.
- **The studio issues the couple's credentials.** Creating a catalogue (wizard step 3, or later
  from the catalogue's settings) takes the couple's email and name and creates their account — an
  org of `kind = couple` with one operator — and links it to the catalogue. The studio chooses
  how the first password reaches them: **email them a link to set one** (default), or **show me a
  temporary password** once, for the studio that is in the room with the couple. A temporary
  password forces a change at first sign-in.
- An address that already has a couple account is **attached, not duplicated**: the second
  wedding, the anniversary from another studio, all land in one account. An address that belongs
  to a studio operator is refused with a plain message.
- Couples do not self-register. They arrive with what their studio gave them, and from there they
  can start catalogues of their own (§6).

### Brute force

**Decided (D-34):** rate limits per address as well as per IP, a lockout, and a challenge behind a
seam.

| Surface | Limit | Then |
|---|---|---|
| Sign in | 5 failures per email **or** per IP in 15 minutes | Locked for 15 minutes; a challenge after the third failure |
| Guest code | 5 failures per IP per catalogue (unchanged); 30 per catalogue across all IPs | Locked for 15 minutes; a challenge after the third failure |
| Registration, forgot password, claim | 3 / 5 / 10 per IP per hour (unchanged) | A challenge on every registration |

The challenge is Cloudflare **Turnstile** behind `CAPTCHA_DRIVER=none|turnstile`, with a `fake`
driver for the suite. With `none`, the rate limits and lockouts still apply — the challenge is a
second layer, not the first. The prototype's arithmetic puzzle is deliberately **not** built: a
script solves it faster than a person, and a control that only stops people is worse than none.

No response on any of these surfaces confirms whether an address exists. The guest-code cookie
carries the catalogue's `passcode_version`, so **changing the code signs out everyone who held
the old one** — which is what the couple who changed it expects, and the console says so.

---

## 3. Ownership, handover, and the studio's way back in

Unchanged in principle from doc 15 §2, extended in three ways:

1. **Linked before owned.** `catalogues.couple_org_id` names the couple's account from the moment
   the studio creates it. Until handover the studio owns the row (`org_id`) and the couple sees it
   in their account as *being prepared by <studio>*, with the actions that make sense before
   delivery: open once live, share, download, change the code.
2. **Handover attaches to the linked account.** When a couple account is linked, the handover
   panel is prefilled and the claim link is also emailed. A couple with an existing account accepts
   by signing in rather than by setting a new password. Ownership moves (`org_id` → couple org);
   `origin_org_id` stays; the credit stays.
3. **The studio's access is off after handover, and the couple can open a window.**
   `catalogues.support_access_until` — set from the couple's account, seven days by default,
   expiring on its own — lets the originating studio open the customizer for a fix or a re-skin.
   It is the second and last authorisation path in the product, it lives in `lib/admin/session.ts`
   beside the first, it is tested for expiry, and a studio without an open window gets the same
   404 it gets today.

The studio keeps a **Delivered** view of every catalogue it originated: couple, status, renewal
date, whether a support window is open. That list is the renewal mechanism doc 15 wants (N-37),
and it costs nothing now that `origin_org_id` exists.

---

## 4. Themes and brand

**Decided (D-35):** the near-black surface stops being the only surface. A **theme** changes the
whole guest surface; **brand** changes the accent, wordmark and credit within it. Both are
platform-curated — a studio picks, never writes CSS.

### What a theme is

A validated token set, nothing more:

```
surface0..3 · textHi/Mid/Lo · accent · accentInk · colorScheme(light|dark)
radiusCard/Modal/Input/Pill · fontDisplay · fontBody (from the shipped faces)
posterPalette (which gradient pairs generated art draws from) · cardEdge (hairline|shadow|none)
```

`ThemeStyle` already writes custom properties per catalogue; it now writes the whole set. Every
guest component already reads tokens (`bg-surface-0`, `text-text-mid`, `.edge`, the scrim), so a
light theme is a different set of values, not a different tree. The two places that hard-code
colour — profile-tile and avatar hues, the generated poster's ink — read from the theme's poster
palette instead.

### The built-in seven

Named for their feel, never for a brand — D-1's reasoning about names and marks applies
here word for word:

| id | Feel | Surface |
|---|---|---|
| `marquee` | The streaming-app look. The default, and everything shipped so far | near-black, hot red |
| `feed` | A photo-first social grid — white, rounded, gradient accent | light |
| `bulletin` | A calm light feed with a blue accent, more room for words | light |
| `carnival` | Deep purple and marigold; the sangeet, not the ceremony | dark |
| `classic` | Ivory, gold, a serif display; the album on the coffee table | light |
| `rainbow` | Multi-hue gradient accent on black; louder than marquee | dark |
| `playtime` | Bright, rounded, big type; birthdays and naming days | light |

### Contrast, still a gate

`judgeAccent` judges against the **theme's** surface, not black. `check:contrast` walks every
built-in theme's token pairs. A platform-authored theme is validated with the same function on
save and refused if a pair fails — a theme that ships unreadable text is the one failure a
white-label product cannot recover from in front of a studio.

### Who can add one

Platform admins, from `/admin/platform/themes`: a form for the token set with the real guest
shell rendering beside it. Stored in a `themes` table with the same schema as a built-in one and
listed through the same `listThemes()`; a theme can be disabled for new catalogues without
touching the catalogues already on it. Studios never author themes; they save **house styles**
(§5), which is the plural of "a look" at the level they actually work.

A theme is part of the catalogue's **draft** — chosen in the wizard or the customizer, seen in the
preview, reaching guests at Publish, exactly as branding does (N-56).

---

## 5. House styles

**Decided (D-36):** a studio saves named presets — **house styles** — and new catalogues start
from one.

A house style bundles: theme · layout (template, or blank) · branding (accent, logo, display font,
presented-by) · language · whether a guest code is on · poster palette. One is marked default.
A studio can create one from scratch, edit, duplicate, delete, and — the way most studios will get
their first — **save this catalogue as a style** from the overview.

Two rules, and the second is the one Sandeep asked for by name:

- **Saving a style affects only catalogues created afterwards.** The values are copied into the
  catalogue at creation (`catalogues.preset_id` records which one); nothing already published
  moves.
- **A style in use by a published catalogue is frozen.** Editing it is refused with the count and a
  one-click *Duplicate and edit*. The record of which look a wedding was delivered in has to keep
  meaning something a year later, and a style that silently drifts is a record that lies.

---

## 6. The couple's account

**Decided (D-37):** `/my` — a light surface, deliberately not a second operator console.

**Home** lists every catalogue the account owns or is linked to, each with its status, its link,
and who made it. **Per catalogue**: open it, share it (the WhatsApp share sheet with the poster
preview), download everything, change or remove the guest code (with the warning that it signs
out everyone holding the old one), rewrite the letter, hide a section without deleting it, and
grant the studio a seven-day access window. **Account**: change password, close the account
(a recorded request — nothing is deleted, the catalogues archive on their own schedule).

They can also **start a catalogue themselves** — anniversary, birthday, baby shower, engagement,
naming day — as a draft that costs nothing until it is published (§7). For a catalogue they own,
the customizer is theirs too: it is the same component, and hiding it would mean building a second,
worse one.

The couple's session is the same `operators` row and the same `org_id` scoping as a studio's.
What differs is the chrome, the vocabulary, and which routes are offered — not how a query is
scoped.

---

## 7. Trial, credits, and paying at the second wedding

**Decided (D-38):** the first published catalogue is free; the second needs a credit.

- Registration grants a studio **one credit**. Publishing a catalogue **for the first time**
  consumes one. Republishing after an unpublish consumes nothing. Catalogues published before this
  change are untouched.
- No credit → Publish is refused with a panel that says why and offers the way to add one. Until
  Razorpay lands (N-20) that way is a request the platform sees and answers by **granting credits
  from the platform console**, with a reason on the audit row. The `credits` table is the one
  `REQUIREMENTS.md` §9 already specifies (org, plan, purchased, expires at 24 months, consumed by).
- A couple's account starts with none: a catalogue they create themselves publishes when their
  studio, or we, add a credit for it.
- The Studio plan (D-18), packs, and expiry all attach here later; N-27c's condition — *a plan
  becomes real when something reads it* — is met by the publish gate.

---

## 8. The platform console

**Decided (D-39):** the platform console grows the writes doc 15 §1 said to add one at a time,
each recorded:

| Page | Reads | Writes |
|---|---|---|
| Dashboard | Studios, couples, catalogues, live/draft, credits outstanding, health summary | — |
| Studios | Every studio, search, status, credits, storage, catalogues | **Create a studio** (with its first operator, who receives a credential link), suspend/restore, quota, **grant credits**, **send a password link** to any operator, **add an operator** |
| Couples | Every couple account with its catalogues | Send a password link |
| Catalogues | Every catalogue across studios, searchable, with status and renewal date | Open the guest page; **take offline** (abuse); **extend the term** — the write that used to be a studio-side date field and is now a platform one, because a studio setting its own renewal date for free is a billing hole |
| Themes | Built-in and platform-authored | Create, edit, enable/disable |
| Domains | Every custom domain and its status | Mark attached, when the provider is manual |
| Health | §9 | — |
| Audit | Every platform write | — |

Self-registration stays open and immediate. Approval before use would cost the studios most
worth having; suspension after the fact costs nothing.

---

## 9. Platform health

**Decided (D-40):** a health page that answers "would a guest notice", not "did the app boot".

Probed live, each with a three-second budget and a sixty-second cache, and each reported as a
row with a state and a sentence:

| Row | What is checked |
|---|---|
| Supabase | The schema answers; the newest migration's table exists |
| Bunny Stream | The library answers; token authentication is enforced on its pull zone |
| Bunny Storage / CDN | The photo zone accepts a HEAD and the pull zone serves |
| Resend | The API accepts the key |
| Notification queue | Rows queued, failed in the last 24 hours, oldest queued age |
| Transcode pipeline | Titles stuck in `processing` / `uploading` past the stall window |
| Scheduled jobs | Last run, outcome and duration for each cron (`job_runs` table, written by every cron) |
| Synthetic guest path | The last result of `/api/cron/synthetic` |
| Custom domains | Domains awaiting attachment or failing checks |

The page is itself reachable only by a platform admin; `/api/health` stays as it is, unauthenticated
and shallow, for uptime monitors.

---

## 10. The create wizard, five steps

Steps 2 and 3 are the ones to do **with the couple in the room** and are flagged as such.

| Step | Collects |
|---|---|
| 1 · The couple | Names, date, city, occasion, the address (with the tenant path shown live) |
| 2 · The look | A house style, **or** a theme plus a layout (template or **blank**), with the real shell rendering the choice |
| 3 · Guests and the couple | Privacy (unlisted or a guest code, with the code), language, timezone, an optional premiere date and time, the couple's email and name — which creates their sign-in — and how their first password reaches them |
| 4 · Upload | Unchanged |
| 5 · Titles | Unchanged |

**Start from blank** exists in the wizard and in the customizer's *Add section* flow: a blank
layout is an empty module list, which the customizer already handles.

---

## 11. Share, and the credit that earns us the next studio

The guest surface gets a **share-this-wedding** control in the top bar and the footer, next to
the per-film and per-photograph share that already exist: the WhatsApp share sheet on a phone,
`wa.me` and copy-link elsewhere, the OG card carrying the poster.

**Decided (D-41):** a small **"Made with Mehfilbox"** line in the footer, **on by default and a
studio setting** (`orgs.branding.platformCredit`). Doc 11 §4's "off by default" was written for
a planner reselling to a couple who must not see a supplier; the studio that wants that turns it
off in one click, and the studio that does not mind earns nothing by hiding it. The landing page's
FAQ says this plainly instead of claiming we never appear.

---

## 12. Responsive

Every surface works from 360px up. The guest surface already does; the consoles are audited and
fixed in the same pass: the customizer stacks its three panes below `lg` with the preview first,
tables become cards below `sm`, the platform pages scroll their tables inside a region rather
than the page, and nothing depends on hover.

---

## 13. Data model additions

```
orgs            + contact_email, timezone, branding.platformCredit
catalogues      + theme_id, preset_id, couple_org_id, support_access_until,
                  passcode_version, timezone, premiere_at, credit_id, custom_domain (kept)
credential_links (id, operator_id, token_hash, purpose set-password|reset, expires_at, used_at)
credits         (id, org_id, plan_id, granted_by, reason, purchased_at, expires_at, consumed_by_catalogue_id, consumed_at)
presets         (id, org_id, name, is_default, theme_id, template_id, branding, locale, passcode_on, poster_palette, created_at, updated_at)
themes          (id, name, description, tokens, enabled, created_by, created_at)
domains         (id, org_id, catalogue_id, host, verification_token, status, last_checked_at, error, created_at)
job_runs        (id, job, started_at, finished_at, ok, detail)
```

Every table gets RLS with no anon policy, as every table since 0002.

---

## 14. What this does not change

The module registry and the customizer's contract. Playback, upload, the lifecycle ladder, the
notification seam, entitlements' resolution order, the platform-admin isolation (still no
`org_id`), the studio-only billing model (D-26), and the promise that nothing is ever deleted.
