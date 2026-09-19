# The studio guide

Everything Mehfilbox does for a studio, planner or photographer building and delivering a wedding.
Published at **`/help/studio`** — this file is the page; editing it and deploying is the whole
publishing step.

This describes what the console does today. Where something is not built yet, it says so.

- **Getting in** — [Registration](#registration) · [Signing in](#signing-in)
- **Building a wedding** — [Creating one](#creating-a-wedding) · [Films](#films) ·
  [Photographs](#photographs) · [The look](#the-look-themes-and-house-styles) ·
  [Publishing](#publishing)
- **Running it** — [Settings](#settings) · [Deleting](#deleting-a-catalogue) ·
  [Handing over to the couple](#handing-over-to-the-couple)
- **After handover** — [Tracking what you delivered](#tracking-what-you-delivered)
- [Limits](#limits) · [When something goes wrong](#when-something-goes-wrong)

---

## Registration

**Where:** `/admin/register`

| Field | Notes |
|---|---|
| Business name | Guests see this as *"presented by"*. Also becomes your address, e.g. `Kalyanam Weddings` → `kalyanam`. |
| Your name | The human, not the business. |
| Email | Becomes your sign-in. |
| Password | At least 12 characters. |

Registration is public — anyone can create a studio account, no approval needed. Three things are
created in order: the credential, the org, and your operator record. Two studios may share a name
but not an address; a taken one gets a numeric suffix automatically rather than an error.

**The email address must be confirmed before you can sign in.** Registration finishes and the org
exists, but the credential is inert until you click the confirmation link. The screen says so.

Your first published wedding is free — one credit is granted on registration. See
[Publishing](#publishing) for what happens after it is spent.

Rate-limited to 3 attempts per IP per hour.

---

## Signing in

**Where:** `/login` — a **Studio** tab and a **Client** tab on the same page. Pick Studio. (The
older `/admin/login` still works and redirects here.)

- **Signing out** is in the account menu, top right, behind your avatar.
- The avatar also shows which studio you are signed in to — worth checking if you hold more than
  one account.
- Forgot your password: **"Reset it"** on the sign-in form sends a single-use link, the same way
  as registration's confirmation link.

---

## Creating a wedding

**Where:** the **New catalogue** button in the top bar — on every page of the console.

Five steps. Nothing is lost if you close the tab partway through; the draft lives in your browser
until the catalogue exists, which happens at the end of step 2.

### 1 — The couple

| Field | Notes |
|---|---|
| Couple | `Aanya & Vikram`. Shown to guests and used to list the wedding for you. |
| Occasion | Wedding, engagement, anniversary, birthday, proposal, performance, event, baby shower or naming day. |
| Wedding date | Also drives "in 12 days" on your list. |
| City | Optional. |
| **Web address** | Suggested from the names **and the year** — `aanya-and-vikram-2026`. Editable until you touch it, checked for availability as you type. |
| App name | The wordmark on the guest's profile screen. Blank uses `<Couple> Originals`. |
| **Storage** | Optional — **Light** (5 GB), **Medium** (50 GB) or **Heavy** (100 GB), sized to the occasion. Leave it unset to keep the default (20 GB). Need more than 100 GB? Ask your platform for a custom amount. |

> **The address is the one thing you cannot casually change later.** It goes into every guest's
> WhatsApp message. Changing it after the link is out breaks every copy already sent — there is no
> redirect for a catalogue's own address, only for a film's (see [Films](#films)).

> **If the address is taken, you are offered a free one to click.** Addresses are unique across
> the whole platform, so a common pair of names can already belong to a wedding you cannot see —
> the message says "already taken" rather than naming who has it. The year makes this rare; the
> offered alternative (`…-2026-k3f`) means it never blocks you.

> Names ending in `-flix` are refused, deliberately.

### 2 — The look

**The catalogue is created at the end of this step.** From here on nothing can lose it.

Two ways in:

- **A house style you have saved** — your studio's own look, applied whole. See
  [The look](#the-look-themes-and-house-styles).
- **A theme and a layout**, chosen fresh — seven built-in themes plus any the platform has added,
  and a layout (**Keepsake**, **Films Only**, **Anniversary**, or **Start from blank**), each shown
  as a thumbnail of the page it produces.

Either way, this only decides what the customizer opens with. Every section can be reordered,
renamed, hidden or removed afterwards, and the theme can be changed later too.

### 3 — Guests & the couple

| Field | Notes |
|---|---|
| Who can watch | Unlisted link, or a passcode — see [Settings](#settings) for the detail. |
| Language | English or Hindi. The couple can still switch it themselves once the page is live. |
| Time zone | Used for the premiere countdown and "in 12 days". |
| Premiere | Optional. A date and time; guests see a countdown until then, and the wedding opens
  automatically after (see [Publishing](#publishing) — a premiere still needs Publish first). |
| The couple's sign-in | Optional here — you can also do this later from the overview. See [Handing over to the couple](#handing-over-to-the-couple). |

### 4 — Upload

Covered below, under [Films](#films) and [Photographs](#photographs). Uploads keep running while
you work anywhere else in the console, including after you leave the wizard.

### 5 — Titles

Name each film, or accept what was guessed from the filename. Covered in full under
[Films](#films).

---

## Films

**Where:** a catalogue → **Films**

### Uploading

Drag files in, or use the picker.

- **Accepted:** `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.m4v`
- **Per file:** up to 20GB
- **Per catalogue:** limited by storage, not by count — see [Limits](#limits)

Bytes go **straight from your browser to the video service**, never through the app.

- **Closing the tab stops the upload.** Navigating elsewhere in the console does not.
- **A dropped connection is not a failure.** The upload is marked *interrupted* and resumes by
  itself once you are back online.
- A row appears in the list immediately, so a refresh mid-upload still shows the file.

### After upload

Each film is transcoded by the provider, which takes a few minutes.

| State | Meaning |
|---|---|
| Uploading | Bytes still moving. |
| Processing | The provider is transcoding. Nothing to do. |
| Ready | Playable. |
| Failed | Something went wrong — open Films for the reason and a **Retry**. |

If a film sits in *processing* far longer than it should, a scheduled job asks the provider what
actually happened and settles the row.

### Naming, and its own address

Names are guessed from filenames — correct them. Each film has a **name**, an optional
**synopsis**, a **category**, **credits**, and a **poster**. A film also has its own address
inside the wedding, shown and editable from the **Address** field in the list — guessed from the
upload filename at first.

> **Unlike the catalogue's address, a film's address can change safely.** The first rename
> re-derives it automatically from the new name; after that, changing it again is deliberate. A
> link built on the old address keeps working for **90 days**, redirecting to the new one.

**Every change saves when you click away**, and the line above the list says so — `Saving…`, then
`Saved`. If it says **`Not saved`**, the change is still in the box and will be retried on your
next edit.

> **A film is not visible to guests until you mark it ready**, even on a published page. This is
> the single most common reason a live catalogue looks empty. The overview's checklist calls it
> out.

---

## Photographs

**Where:** a catalogue → **Photographs**

- Limited by storage rather than by count.
- Photographs are **resized in your browser before upload**, to three widths (2048 / 1024 / 480).
  A 40MB frame straight off a DSLR does not have to travel, and every guest is served a size that
  suits their screen.
- Every photograph URL a guest's browser loads is **individually signed and expires** — the same
  protection films have always had.

### Captions

Each photograph has a caption box under its thumbnail. Type and click away — it saves on blur, the
line above the grid says `Saving…` then `Saved`, or `Not saved` if it failed.

Captions are what a guest reads in the lightbox: *"Her father seeing the lehenga for the first
time"* is worth more than the photograph beside it.

---

## The look: themes and house styles

**Where:** a catalogue → **Customizer**; house styles at `/admin/studio/styles`

Three columns in the customizer: the section list, a live preview, and an editor for whatever is
selected. **The preview renders the real guest components** — not an approximation — so you cannot
publish something you never saw.

### Editing a wedding's sections

| To do this | Do this |
|---|---|
| Rename a section | Click its heading **in the preview** and type. Enter commits, Escape cancels. Or use the inspector. |
| Reorder | Drag in the preview, drag in the list, or use the ↑ ↓ buttons — the buttons work everywhere. |
| Hide from guests | The eye toggle. **Config is kept**, so unhiding restores it exactly. |
| Remove | The bin. This discards the section's settings. |
| Add | **Add section**. |
| Undo | Twenty steps deep. |

Changes autosave as a **draft**. `Saved as draft` under the header confirms it. Guests see none of
it until you publish.

### Theme and branding

Pick a **theme** — seven built in, plus any the platform has added — and it repaints the whole
guest surface: colours, type, the preview's own frame, even the posters generated for films.
Branding on top of a theme is **accent colour, logo, display font, and "presented by"**. **You are
warned at pick time if an accent will not read as white button text**, before you can publish
something illegible.

### House styles

**Where:** `/admin/studio/styles`

Your studio's own saved looks — a house style plus a template — reusable across every wedding
instead of choosing fresh each time. Capture one from a wedding you have already built, or start
one from scratch; the wizard's step 2 offers every saved style.

**A house style in use by a published wedding is frozen.** Changing it would silently repaint a
delivered catalogue. **Duplicate and edit** makes a new style instead.

**Every theme is free to duplicate, without limit.** The styles page also lists every theme —
built in or added by the platform — each with its own **Duplicate as a house style** button. It
makes a new, fully editable style starting from that theme's own colours, which you can then
rename, restyle and set as default like any other.

### Sections available

Phase 0: **billboard**, **film row**, **photo row**, **letter**, **photo grid**.
Phase 1: **keep watching**, **our story** (timeline), **bucket list** (checklist), **pick one for
us** (randomiser).

Every section **disappears when it has nothing to show** rather than rendering an empty heading —
a film row with no films, a timeline with no moments, a "keep watching" row for a first-time guest
are all simply absent.

---

## Publishing

**Publish** in the customizer. It flushes any in-flight draft first, so it can never ship a stale
version.

Before that — or after you take it offline — the link resolves but shows guests a neutral *"not
yet available"* screen. It is never a 404, so a link sent early is embarrassing rather than broken.
If a **premiere** date is set, guests instead see a countdown until it, then the wedding opens on
its own.

The catalogue **overview** carries a checklist of what is left:

1. Films uploaded
2. Films finished processing
3. **At least one film shown to guests**
4. Photographs added *(optional)*
5. Their colour and logo *(optional)*
6. Published

### Credits

**Your first published wedding is free.** Every one after that spends one **Deliver credit**. What
a credit costs — and the price for five — is on your **Credits** card under *Your studio*, and
always shows today's price. Publish without one shows exactly what is short and an **Ask for a
credit** button — nothing about the wedding is lost while you wait, and the platform adds credits
the same working day. Online payment is not built yet (N-20); this is the interim.

---

## Settings

**Where:** a catalogue → **Settings**

### Who can watch

| Option | Behaviour |
|---|---|
| **Unlisted link** (default) | Anyone with the link. Never indexed, never listed anywhere. |
| **Passcode** | Guests type a code from the invitation. **Five wrong tries locks that address out for fifteen minutes.** |

**Generate one for me** fills in a code and copies it, if you would rather not make one up.
Leaving the field blank on save keeps the existing code; switching back to unlisted clears it.
Changing a passcode signs out everyone still holding the old one.

> **A passcode is view-only.** Downloading the wedding needs a sign-in — the studio's own, or the
> client's once handed over — even on a passcode-protected wedding. This is deliberate: a code
> passed around at the wedding should not also hand out full-resolution originals forever.

### Their own address

A domain the couple owns, pointed here. They add a CNAME and the domain is added to the hosting
project. **Until both are done this is stored but not served** — saving it alone does nothing.
**Check DNS** on this screen confirms the record is actually there before you tell them it works.

### Serving until

After this date guests see a **renewal screen** — never a broken link, and nothing is deleted.
Twelve months are included from creation.

### Take offline

**Unpublish** returns the catalogue to the "not yet available" screen. Nothing is deleted and the
films stay exactly where they are.

---

## Deleting a catalogue

**Where:** Settings → the red panel at the bottom.

You must **type the catalogue's address** to confirm. It removes every film from the video
provider, every photograph and every resized version of it, every record of guests watching, and
the catalogue itself.

**There is no undo and no copy.** If you only want it hidden, take it offline instead.

---

## Handing over to the couple

**Where:** a catalogue → **Overview** → *Hand this over to the couple*.

You can give them a sign-in **at creation** (wizard step 3) or **any time later** from here — a
link to set a password, or a temporary one shown once and replaced at their first sign-in. Either
way, you never hold the password they end up choosing.

1. Enter the couple's email.
2. You get **a link to send them yourself** — Mehfilbox does not email it; you and the couple are
   already talking, and a link you forward arrives, where an automated one lands in spam.
3. They open it, see what they are being given and by whom, and set a password.
4. The wedding moves to their own account — from here on, they sign in on the **Client** door.

### What to know

- **The link is shown exactly once.** Only a hash of it is stored, so it cannot be shown again —
  copy it before you dismiss it.
- **Anyone who opens it can claim the wedding.** Send it to the couple and nobody else.
- **One live handover per catalogue.** A second attempt is refused; cancel the outstanding one to
  issue a new link.
- Links expire after **14 days**. Missing, expired and already-claimed all look identical to
  whoever opens one — a link that said which would tell a stranger something about a wedding.

### After it is claimed

- You **lose access entirely** — it is gone from your list, and 404 by direct link — unless the
  couple opens a **support window** for you from their own console, good for seven or fourteen
  days and closing on its own.
- Your credit survives: *"presented by"* is snapshotted while you still own the row, and the
  catalogue permanently records that you built it.

---

## Tracking what you delivered

**Where:** your console's list page, **Delivered**

Every catalogue you originated, wherever it lives now, with its renewal date and status — the
collection channel for a renewal, not a report nobody reads. A catalogue past its term shows here
before a couple ever has to ask you what happens next.

---

## Limits

**Storage is the only limit.** There is no cap on how many films or photographs a catalogue
holds.

| Limit | Default |
|---|---|
| **Storage per catalogue** | **20 GB**, or a tier chosen at creation |
| Per-file upload | 20 GB |
| Included term | 12 months |

Storage counts what the provider actually stores — the encoding ladder for a film, every
rendition for a photograph — not the file that was uploaded. An upload that would not fit is
refused before a byte moves, with the figures in the message.

**A storage tier — Light (5 GB), Medium (50 GB) or Heavy (100 GB) — set in the wizard
overrides the 20 GB default for that one catalogue**, sized to the occasion rather than left flat.
Every catalogue or org can also be granted more by hand, and **a catalogue's own grant always
wins** — which matters after a handover, so a client who buys storage does not stay capped by a
studio who has already left the relationship.

**When a wedding is full, an Ask for more space button appears** on its overview, next to the
warning. We add it by hand, the same working day — buying it yourself is not built yet.

---

## When something goes wrong

| Symptom | Cause |
|---|---|
| **Guests see an empty catalogue** | Films are uploaded and ready, but none marked *shown to guests*. The overview checklist flags this. |
| **A film is stuck in *processing*** | Usually the provider still working. If it persists, the reconcile job settles it; check Films for a failure and **Retry**. |
| **A guest gets "not yet available"** | Never published, unpublished, or waiting on a premiere date. |
| **A guest gets a renewal screen** | Past *serving until* in Settings. |
| **A guest is locked out of the passcode** | Five wrong tries; fifteen minutes. |
| **A client cannot download** | Downloading needs a sign-in even on a passcode wedding — the passcode alone is view-only. |
| **You never got your confirmation email** | Contact us — SMTP misconfiguration has happened before and is worth ruling out first. |
| **A handover link is refused** | One live handover per catalogue — cancel the outstanding one first. |
| **A handover link says "no longer valid"** | Used, expired, or cancelled. Issue a new one. |
| **A custom domain does not work** | The CNAME, the hosting project, or both. Storing it is not enough — use **Check DNS**. |

---

## Where else to look

| | |
|---|---|
| [Client guide](/help/client) | The same product from the other side |
