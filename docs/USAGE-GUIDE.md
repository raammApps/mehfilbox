# Usage guide

Every workflow the product supports, in the order somebody meets them: a partner signs up, builds
a wedding, hands it to the client, and the client keeps it going.

This describes **what the software does today**, not what is planned. Where a flow is incomplete
or needs a person with a password, it says so rather than reading around it. `docs/NEXT.md` holds
what is left.

The product lives at **`heirloomfilms.in`** — the console at `/admin`, a wedding at
`/c/<address>`. Email goes out through Resend from `hello@heirloomfilms.in`.

- **Who does what** — [Roles](#1-roles)
- **Getting an account** — [Registration](#2-partner-registration) · [Signing in](#3-signing-in-and-out)
- **Building a wedding** — [Create](#4-creating-a-catalogue) · [Films](#5-films) · [Photographs](#6-photographs) · [Customizer](#7-the-customizer) · [Publish](#8-publishing)
- **Running it** — [Settings](#9-settings) · [Deleting](#10-deleting-a-catalogue) · [Handover](#11-handing-a-wedding-to-the-couple)
- **The other side** — [Guests](#12-what-a-guest-sees) · [Clients](#13-what-a-client-can-do)
- **Platform** — [Platform admin](#14-platform-admin) · [Limits](#15-limits-and-entitlements) · [When things go wrong](#16-when-something-goes-wrong)

---

## 1. Roles

| Role | Belongs to | Can see |
|---|---|---|
| **Partner** | their own org | every catalogue their org owns |
| **Client** | their own org, created at handover | the one wedding handed to them |
| **Platform admin** | **no org at all** | every org, read-only |
| **Guest** | nothing — no account | one catalogue, via its link |

Partner and client are the same software wearing different hats: a client's org is an ordinary
org that happens to hold one catalogue. That is deliberate. An "owner" column instead would make
every query in the product ask *"my org, or am I the owner?"*, and cross-tenant leaks live in
that branch. The database value `orgKind = 'couple'` does not change — it is not a word anybody
reads, and the client is not always a couple: a naming day or a fashion show has a client and no
couple (D-42).

A platform admin is **not** a member of any org, for the same reason. There is no way to widen a
partner into an admin, in either direction.

---

## 2. Partner registration

**Where:** `/admin/register`

| Field | Notes |
|---|---|
| Business name | Guests see this as *"presented by"*. Also becomes your address, e.g. `Kalyanam Weddings` → `kalyanam`. |
| Your name | The human, not the business. |
| Email | Becomes your sign-in. |
| Password | At least 12 characters. |

Three things are created in order: the credential, the org, and your operator record. Two
businesses may share a name but not an address — a taken address gets a numeric suffix
automatically rather than an error.

> **Only the person who owns the inbox can complete a registration.** That is the point of the
> confirmation step: before it, anyone could sign up using an address they did not own.

**The email address must be confirmed before the partner can sign in.** Registration finishes and
the org exists, but the credential is inert until they click the link — so a partner who registers
in front of you cannot demonstrate anything until they open their inbox. The confirmation screen
says so.

The message comes from `hello@heirloomfilms.in` through Resend, and its link returns to
`heirloomfilms.in`. If a partner reports the link is dead, it is almost always because it was
already used: the token is **single-use**, so a preview pane that fetches links, a security
scanner, or a second click all spend it. The remedy is to register again or use
`/admin/login` → password reset, not to retry the same link.

Rate-limited to 3 attempts per IP per hour.

---

## 3. Signing in and out

**Where:** `/admin/login` · Email and password.

- **Signing out** is in the account menu, top right, behind the avatar.
- The avatar also shows which org you are signed in to — worth checking before you change
  anything if you hold more than one account.
- A **platform admin** signing in lands on `/admin/platform` rather than a catalogue list,
  because they have no catalogues of their own.

### Resetting a password

Use Supabase's **"Reset password"**. Do **not** delete and recreate the auth user: `operators.id`
references `auth.users(id)` with `on delete cascade`, so deleting the user silently destroys the
operator record and login then fails in a way that looks like the app is broken. This has
happened; `docs/DEPLOYMENT.md` §11 has the recovery.

---

## 4. Creating a catalogue

**Where:** the **New catalogue** button in the top bar — it is on every page of the console.

Four steps. Nothing is lost if you close the tab during steps 1–2; the draft is kept in your
browser until the catalogue exists.

### Step 1 — the wedding

| Field | Notes |
|---|---|
| Couple | `Aanya & Vikram`. Shown to guests and used to list the wedding for you. |
| Wedding date | Also sets what guests see, and drives "in 12 days" on your list. |
| City | Optional. |
| **Web address** | Suggested from the couple's names **and the wedding year** — `aanya-and-vikram-2026`. Editable until you touch it, checked for availability as you type, and the real address is shown underneath. |
| App name | The wordmark on the guest's profile screen. Blank uses `<Couple> Originals`. |

> **The address is the one thing you cannot casually change later.** It goes into every guest's
> WhatsApp. Changing it after the link is out breaks every copy already sent.

> **If the address is taken, you are offered a free one to click.** Addresses are unique across
> the whole platform, so a common pair of names can be held by a wedding belonging to a studio you
> cannot see — which is why the message says "already taken" rather than naming who has it. The
> year makes that rare; the offered alternative (`…-2026-k3f`) means it never blocks you.

> Names ending in `-flix` are refused, deliberately. Try `…Originals`, `…Stream` or `The … Files`.

### Step 2 — the shape

Three templates, each shown as a **thumbnail of the page it produces** rather than described:

| Template | What it lays out |
|---|---|
| **The Keepsake** | Billboard, a film row, a written message, a second row, the photographs. The default and what most weddings want. |
| **Films Only** | Billboard and one row. For a delivery that genuinely is just the films. |
| **Anniversary** | A message first, then films and photographs. Quieter. |

This only decides what is already there when you open the customizer. Every section can be
reordered, renamed, hidden or removed afterwards.

**The catalogue is created at the end of this step.** From here on nothing can lose it.

### Steps 3 and 4 — upload and title

Covered below. Uploads keep running while you work anywhere else in the console, including after
you leave the wizard.

---

## 5. Films

**Where:** a catalogue → **Films**

### Uploading

Drag files in, or use the picker.

- **Accepted:** `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.m4v`
- **Per file:** up to 20GB
- **Per catalogue:** limited by storage, not by count — see [Limits](#15-limits-and-entitlements)

Bytes go **straight from your browser to the video service**, never through the app. Practical
consequences:

- **Closing the tab stops the upload.** Navigating elsewhere in the console does not.
- **A dropped connection is not a failure.** The upload is marked *interrupted* and resumes by
  itself when you are back online.
- A row appears in the list immediately, so a refresh mid-upload still shows the file.

### After upload

Each film is transcoded by the provider, which takes a few minutes. States you will see:

| State | Meaning |
|---|---|
| Uploading | Bytes still moving. |
| Processing | The provider is transcoding. Nothing to do. |
| Ready | Playable. |
| Failed | Something went wrong — open Films for the reason and a **Retry**. |

If a film sits in *processing* far longer than it should, a scheduled job asks the provider what
actually happened and settles the row. You do not need to do anything.

### Naming and choosing what guests see

Names are guessed from filenames — correct them. Each film has a **name**, an optional
**synopsis**, a **category**, **credits**, and a **poster**.

**Every change saves when you click away, and the line above the list says so** — `Saving…`, then
`Saved`. If it says **`Not saved`**, the change is still in the box and will be retried on your
next edit; it has not been silently lost. Worth knowing because the list used to save in complete
silence, which was indistinguishable from not saving at all.

> **A film is not visible to guests until you mark it ready**, even on a published page. This is
> the single most common reason a live catalogue looks empty. The overview's checklist calls it
> out explicitly.

---

## 6. Photographs

**Where:** a catalogue → **Photographs**

- Limited by storage rather than by count.
- Photographs are **resized in your browser before upload**, to three widths (2048 / 1024 / 480).
  A 40MB frame straight off a DSLR does not have to travel, and guests are served a size that
  suits their screen.
- Unlike films, photographs **do** pass through the app. The storage credential can delete every
  catalogue's images, so it must never reach a browser.

### Captions

Each photograph has a caption box under its thumbnail. Type and click away — it saves on blur, and
the line above the grid says `Saving…` then `Saved`, or `Not saved` if it failed.

Captions are what a guest reads in the lightbox, and they are the difference between an album and
a story: *"Her father seeing the lehenga for the first time"* is worth more than the photograph
beside it.

---

## 7. The customizer

**Where:** a catalogue → **Customizer**

Three columns: the section list, a live preview, and an editor for whatever is selected. **The
preview renders the real guest components** — not an approximation — so you cannot publish
something you never saw.

### Selecting

- **Click anything in the preview** to edit it. Sections open their own editor; the nav, footer
  and "presented by" open **branding**.
- Clicking a section **in the list** scrolls the preview to it.

### Editing

| To do this | Do this |
|---|---|
| Rename a section | Click its heading **in the preview** and type. Enter commits, Escape cancels. Or use the inspector. |
| Reorder | Drag in the preview, drag in the list, or use the ↑ ↓ buttons — the buttons are the keyboard path and work everywhere. |
| Hide from guests | The eye toggle. **Config is kept**, so unhiding restores it exactly. |
| Remove | The bin. This discards the section's settings. |
| Add | **Add section**. |
| Undo | Twenty steps deep. |

Changes autosave as a **draft**. `Saved as draft` under the header is your confirmation. Guests
see none of it until you publish.

### Branding

Accent colour, logo, display font, and "presented by". The preview repaints live. **You are
warned at pick time if an accent will not read as white button text** — the warning appears
before you can publish something illegible, not after.

### Sections available

Phase 0: **billboard**, **film row**, **photo row**, **letter**, **photo grid**.
Phase 1: **keep watching**, **our story** (timeline), **bucket list** (checklist), **pick one for
us** (randomiser).

Every section **disappears when it has nothing to show** rather than rendering an empty heading.
A film row with no films, a timeline with no moments, and a "keep watching" row for a first-time
guest are all simply absent.

---

## 8. Publishing

**Publish** in the customizer. It flushes any in-flight draft first, so it can never ship a stale
version.

Before that, the link resolves but shows guests a neutral *"not yet available"* screen — it is
never a 404, so a link sent early is embarrassing rather than broken.

The catalogue **overview** carries a checklist of what is left before guests arrive:

1. Films uploaded
2. Films finished processing
3. **At least one film shown to guests**
4. Photographs added *(optional)*
5. Their colour and logo *(optional)*
6. Published

"Ready" means the required items are done — a guest opening the link right now finds something to
watch. The two optional ones do not gate it.

---

## 9. Settings

**Where:** a catalogue → **Settings**

### Who can watch

| Option | Behaviour |
|---|---|
| **Unlisted link** (default) | Anyone with the link. Never indexed, never listed anywhere. |
| **Passcode** | Guests type a code from the invitation. **Five wrong tries locks that address out for fifteen minutes.** |

Leaving the passcode field blank keeps the existing one. Switching back to unlisted clears it.

### Their own address

A domain the couple owns, pointed here. They add a CNAME and the domain is added to the hosting
project. **Until both are done this is stored but not served** — saving it alone does nothing.

### Serving until

After this date guests see a **renewal screen** — never a broken link, and nothing is deleted.
Three months are included from creation.

### Take offline

**Unpublish** returns the catalogue to the "not yet available" screen. Nothing is deleted and the
films stay exactly where they are. This is what you want if a couple asks you to pull it down for
a week.

---

## 10. Deleting a catalogue

**Where:** Settings → the red panel at the bottom.

You must **type the catalogue's address** to confirm. Not a dialog — this destroys a wedding, and
a confirm box is muscle memory by the third time you see one.

It removes:

- every film from the video provider,
- every photograph and every one of its resized versions from storage,
- every record of guests watching,
- the catalogue itself.

**There is no undo and no copy.** If you only want it hidden, take it offline instead.

---

## 11. Handing a wedding to the couple

**Where:** a catalogue → **Overview** → *Hand this over to the couple*. Partners only — a couple
has nobody to hand their own wedding to.

1. Enter the couple's email.
2. You get **a link to send them yourself**.
3. They open it, see what they are being given and by whom, and set a password.
4. The wedding moves to their own new org.

### What to know

- **The link is shown exactly once.** Only a hash of it is stored, so it cannot be shown again.
  Copy it before you dismiss it.
- **Anyone who opens it can claim the wedding.** Send it to them and nobody else.
- **We do not email them.** You forward it yourself — partner and couple are already talking, and
  a link you send arrives, whereas an automated email lands in spam.
- **One live handover per catalogue.** A second attempt is refused. The outstanding one is shown
  with the address it went to; **cancel it to issue a new link**.
- Links expire after **14 days**. Missing, expired and already-claimed all look identical to
  whoever opens one — a link that says which would tell a stranger something about a wedding.

### What the couple does

They set a password and the wedding is theirs. Two things then happen that are worth knowing when
you hand a couple your own phone or laptop to do it on:

- **Signing in signs you out.** The button on the confirmation screen ends whatever session is
  already on that device before going to the login page, with their address filled in. Otherwise
  they would land in *your* console and see *your* weddings.
- **They may have to confirm their email first**, exactly as a partner does. The screen tells them
  so. Until they click that link they cannot sign in, even though the wedding is already theirs.

### After it is claimed

- You **lose access entirely** — it is gone from your list, and 404 by direct link.
- Your credit survives: "presented by" is snapshotted while you still own the row, and the
  catalogue permanently records that you built it.

---

## 12. What a guest sees

No account, ever. They open the link and get:

1. **The profile gate** — *"Who's joining?"* with four fixed choices: Bride's side, Groom's side,
   Friends, Family. **Never a free-text name.** They can skip it.
2. The catalogue: billboard, rows, whatever you arranged.
3. A film opens in a modal, then plays on its own page.

Other behaviour worth knowing:

- **Resume works.** Position is remembered; "Start over" abandons it rather than arguing.
- **`?t=` deep links** start at that moment — the share mechanic.
- English and Hindi, switchable.

### Sharing and liking

Both work on **films and photographs**, and both matter commercially: the link spreads because a
guest forwards it, not because anyone markets it.

| | What it does |
|---|---|
| **Share** | `navigator.share` — on a phone this is the WhatsApp sheet. Falls back to a WhatsApp link and copy-link on desktop. |
| **Copy link** | A film's link carries `?t=` so it opens at the moment being talked about. A photograph's carries `?photo=<id>` and reopens that exact photograph in the lightbox. |
| **Like** ♥ | Tap the heart. **Counted across every guest and shown to all of them**, so the number beside a photograph is what everyone sees, not a private bookmark. Tap again to remove it. |

A photograph's address is the catalogue page plus `?photo=…`, and the address bar follows the
guest as they swipe — so whatever they copy is whatever they are looking at. Closing the lightbox
clears it, so nobody carries a stale photo link into their next visit.

Likes are per **device**, not per person: a guest who opens the link on a phone and a laptop can
like the same photograph twice. That is deliberate — the alternative is making guests sign in, and
this is a wedding gallery rather than a ballot.
- Playback URLs are **signed and expire within the hour**, so a copied `.m3u8` dies. The database
  never stores a signed URL.

### The three screens that are not the catalogue

| Screen | When |
|---|---|
| **Not yet available** | The catalogue is still a draft. |
| **Passcode** | Passcode privacy is on and they have not entered it. |
| **Renewal** | Past *serving until*. Shows a support email. |

A lapsed wedding shows the renewal screen **before** anything else — the couple must always land
somewhere that explains itself, never on a 404.

---

## 13. What a client can do

After claiming, a client's console is the partner's console minus the handover panel. They can:

- add and remove films and photographs,
- rearrange and rename sections, change branding,
- publish and unpublish,
- change privacy and the passcode,
- delete the catalogue.

They cannot see any other wedding, and the partner cannot see theirs.

> **Renewal and buying storage are not built yet (N-20).** Today, extending *serving until* is
> something an operator does in Settings. There is no payment flow.

---

## 14. Platform admin

**Where:** `/admin/platform`

Two views, both **read-only**:

- every org, its kind, its address and how many catalogues it holds;
- one org's catalogues, with a link to the guest page.

There is **no write path at all** — not a disabled button, none. Support means being able to
describe what a partner is describing. Anything more should be something they do while you watch.

To an ordinary operator this surface **answers 404**, so they do not learn it exists.

> The `platform_admins` table is **empty**, so nobody can reach this today. That is the correct
> default. Adding the first row is a SQL insert — see `docs/NEXT.md`.

---

## 15. Limits and entitlements

**Storage is the only limit.** There is no cap on how many films or photographs a catalogue
holds — a wedding with a film per function is exactly what the product is for. What a customer
gets is set by their plan; see [`PRICING.md`](./PRICING.md).

| Limit | Default |
|---|---|
| **Storage per catalogue** | **20 GB** |
| Per-file upload | 20 GB |
| Included term | 12 months |

Storage counts what the provider actually stores — the encoding ladder for a film, every
rendition for a photograph — not the file that was uploaded. An upload that would not fit is
refused before a byte moves, with the figures in the message.

The caps are **a curation requirement first and a cost ceiling second**. Fifteen films is the
point at which a keepsake becomes a folder; if you routinely want past it, the product has
drifted into being an archive.

They are no longer constants — a catalogue or an org can be granted more, and **a catalogue's own
grant wins**, per limit. That matters after a handover: a client who buys storage must not stay
capped by a partner who has already left the relationship.

> **Nothing writes a grant yet** — that is the billing work (N-20). Until
> `supabase/migrations/0006_entitlements.sql` is applied, every catalogue resolves to the
> defaults above, and a lookup failure resolves to them too. That is deliberate: erring toward
> "free tier" is recoverable, erring toward "unlimited" is a bill.

---

## 16. When something goes wrong

| Symptom | Cause |
|---|---|
| **Guests see an empty catalogue** | Films are uploaded and ready, but none marked *shown to guests*. The overview checklist flags this. |
| **A film is stuck in *processing*** | Usually the provider still working. If it persists, the reconcile job settles it; check Films for a failure and **Retry**. |
| **A guest gets "not yet available"** | Never published, or unpublished. |
| **A guest gets a renewal screen** | Past *serving until* in Settings. |
| **A guest is locked out of the passcode** | Five wrong tries; fifteen minutes. |
| **A partner never got their confirmation email** | SMTP is not configured (N-17). Create the account yourself. |
| **A handover link is refused** | One live handover per catalogue — cancel the outstanding one first. |
| **A handover link says "no longer valid"** | Used, expired, or cancelled. Issue a new one. |
| **A custom domain does not work** | The CNAME, the hosting project, or both. Storing it is not enough. |
| **Login fails after a password change** | The auth user was deleted and recreated rather than reset. See `docs/DEPLOYMENT.md` §11. |

### Checking the system itself

```bash
pnpm preflight
```

Reports the real state of the database and the video service in a few seconds, and is more
trustworthy than any document — including this one.

---

## Where else to look

| | |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How it fits together, with diagrams |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Accounts, environment, DNS, and the settings that fail silently |
| [`NEXT.md`](./NEXT.md) | What is not built yet |
| [`spec/`](./spec/) | What the product was intended to be |
