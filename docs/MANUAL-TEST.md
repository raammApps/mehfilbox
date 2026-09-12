# Manual test walkthrough

A script for exercising the product by hand, in the order a real studio would meet it. Every URL
below is production, and every expected result was observed on **11 September 2026** unless the step
says otherwise.

`USAGE-GUIDE.md` explains what each feature *is*. This is what to click, and what should happen.

---

## 0. Two things are broken before you start

Read these first — one of them will otherwise look like your mistake.

### The Resend API key is invalid, so **registration is broken**

`https://api.resend.com/domains` refuses the key in `.env.vercel.local`. That breaks two things:

- **Supabase's confirmation email.** `POST /auth/v1/signup` returns
  `"Error sending confirmation email"`, so `/admin/register` fails — and it tells the visitor
  *"That did not work. Try a different email address."* A real studio would read that as their own
  address being at fault.
- **Every message we send ourselves.** `NOTIFY_DRIVER=resend` uses the same key, so handover,
  delivery, expiry, grace, archive and ops-alert emails would all fail.

The key worked on 7 September — the one `ops-alert` row in `notifications` is `sent`. It has been
revoked or rotated since.

**Fix:** issue a new key at [resend.com/api-keys](https://resend.com/api-keys), then put it in
**both** places — they are separate and both are needed:

1. `RESEND_API_KEY` in `.env.vercel.local`, then `./scripts/deploy-vercel.sh`
2. Supabase → Project Settings → Authentication → SMTP Settings → password

Verify with:

```bash
curl -s https://api.resend.com/domains -H "Authorization: Bearer $RESEND_API_KEY"
```

### Nobody is a platform admin, so `/admin/platform` 404s

`platform_admins` is empty, which is the correct default — the console is invisible rather than
refused. To reach it, insert yourself:

```sql
insert into platform_admins (id, email, name)
values ('<your auth.users id>', 'you@example.com', 'Sandeep');
```

---

## Signing in

Sign in is at **https://mehfilbox.com/login** — a Studio door and a Couple door (D-33); the old
`/admin` address redirects there. Three things to try before anything else:

1. Type a wrong password three times. The third refusal brings up the challenge (Turnstile in
   production, a checkbox on a build with `CAPTCHA_DRIVER=fake`); the right password is refused
   until it is completed.
2. **Forgot password?** with a real address and with a made-up one. Both answer the same sentence;
   only the real one gets an email, and that email is ours — the link lands on `/set-password/…`,
   works once, and expires in an hour.
3. Open the same link twice. The second time explains itself without showing a form.

A studio created for this walkthrough, already email-confirmed so the broken mailer does not block
you:

| | |
|---|---|
| **URL** | https://mehfilbox.com/login?door=studio |
| **Email** | `sandeep.bh5+walkthrough@gmail.com` |
| **Password** | in `/tmp/wt-pw.txt` on this machine — ask, or reset it in Supabase |
| **Studio** | Walkthrough Studio · one wedding, *Meera & Arjun* |

Delete it when you are done: remove the `operators` row, then the `orgs` row, then the auth user.

---

## 1. The public pages · no login

| Step | URL | Expect |
|---|---|---|
| Landing page | https://mehfilbox.com | *"Hand over the wedding, not a folder of files."* Partner pricing — ₹4,999 plan, ₹1,999 Deliver — beside suggested retail |
| Pricing anchor | https://mehfilbox.com#pricing | Three per-wedding plans, "All prices exclude GST" |
| Demo wedding | https://mehfilbox.com/c/aanya-and-vikram | Profile gate, then films. This is what the landing page's **Open a demo wedding** points at |
| Privacy | https://mehfilbox.com/privacy | Says a guest gives no account and no email |
| Terms | https://mehfilbox.com/terms | Says the studio is the customer, and what happens if a studio disappears |

**Worth checking:** the landing page must never quote a couple-facing price. Under studio-only
(D-26) every number there is what *you* pay, next to what studios charge.

---

## 2. Create a wedding

Start at https://mehfilbox.com/admin/new

1. **Step 1 — the couple.** Type a couple name. The web address should auto-suggest
   `name-and-name-<year>`; typing "Meera & Arjun" gave `meera-and-arjun-2026`.
   The year is deliberate — two couples with the same names in different years do not collide.
2. Watch the address line: it says **Available** or **taken** as you type, before you commit.
3. **Step 2 — the shape.** Pick a language (**this is per wedding**, seeded from your studio) and a
   template. Choose **हिंदी** to exercise §5.
4. **Create and start uploading.** It says *"exists as a draft at /… Nothing from here on can lose
   it."*

✅ It is a **draft**: nobody can open the address yet.

---

## 3. Upload a film

Step 3 of the wizard, or the **Films** tab afterwards.

1. Drop an `.mp4`/`.mov`/`.mkv`/`.webm`/`.avi`/`.m4v` in.
2. Navigate away mid-upload — to Photographs, to another wedding. **The upload keeps going.**
3. Kill your Wi-Fi for ten seconds and restore it. It should resume, not restart.
4. The film sits at *processing* until Bunny finishes, then flips to *ready* on its own.
5. Tick **Shown to guests** on the film.

✅ Ticking that box does **not** put it in front of the couple yet — it goes live at the next
Publish (N-57). The customizer says how many films are waiting.

> **No file to hand?** The demo wedding at `/c/aanya-and-vikram` already has three real films, and
> §7–§8 work against it if you use its own console entry instead.

---

## 4. The customizer

`https://mehfilbox.com/admin/c/<id>/customizer`

| Check | Expect |
|---|---|
| The editor opens on **something** | The right-hand panel shows the first section, not "Nothing selected" |
| **Branding** is above the suggestions | Colour, logo, typeface, "Presented by" — the thing you set every time |
| Reorder a section | Drag it, or use ↑ ↓, or tab to the handle and use the arrow keys — **keyboard must work** |
| **Undo**, then **Redo** | Both enabled, both reverse each other |
| Hide a section | It vanishes from the preview and stays in the list |
| Click a section in the *preview* | The editor follows it |
| Change the accent colour | The preview repaints, **the admin around it does not** |
| Contrast readout | A weak colour warns with a ratio, and does not silently accept |

The publish line under the preview should read one of exactly three things:

- **Not published yet — nobody can open this page.**
- **Guests are still seeing the last published version.**
- **Guests are seeing exactly this.** *(with a link to open the live page)*

✅ Edit something after publishing. It must flip back to *"still seeing the last published
version"* immediately — that sentence is the whole point of N-55.

---

## 5. Publish, and what a guest sees

1. Press **Publish**. The line becomes *"Guests are seeing exactly this"* and the button disables.
2. Open the address in a **private window** — https://mehfilbox.com/c/meera-and-arjun-2026

| Check | Expect |
|---|---|
| Language | A Hindi wedding opens **in Hindi with no cookie set** — profile gate, chrome, footer |
| `<html lang>` | `hi`. Inspect it; a screen reader acts on this |
| Profile gate | *"कौन देख रहा है?"* — pick one or skip |
| Footer | *"प्रस्तुति: <your studio>"* and a **download** link |
| Toggle EN/हिं | Switches, and survives a reload |
| Play a film | Starts in about a second on 4G |
| Like a photograph | The heart counts, survives a reload, and is visible to another guest |
| Share | Copies a link that opens the same film directly |

---

## 6. Download everything

`https://mehfilbox.com/c/<slug>/download` — also linked from every wedding's footer.

| Check | Expect |
|---|---|
| Films | Each with a size and the quality handed over — `original` where Bunny kept it |
| Photographs | Numbered, each a direct download |
| A link actually works | `curl -I` one: `HTTP 200`, and a video content-type |
| Nothing missing quietly | If a film could not be prepared it says so, and hands over the rest |

✅ **The one that matters:** set *Serving until* to yesterday in Settings, reload the wedding — you
get the renewal screen — then open `/download` again. **It still works.** Lapsing is a billing
state; the wedding is not ours to withhold.

✅ And the opposite: set a passcode, open `/download` in a private window without entering it. It
**404s**. Lapsing does not relax the passcode.

---

## 7. Send it to the couple

On the wedding's **Overview**, below the link — appears only once published.

1. Type an address, press **Email it**. It says *"Queued — it goes out within fifteen minutes."*
2. Press **Open in WhatsApp**. Your own WhatsApp opens with the message already written, in the
   **wedding's** language.
3. Expand **What it says** to read it first.

✅ Try it on an unpublished wedding — the panel is not there at all. A delivery message pointing at
"not yet available" gets forwarded to two hundred people who all open nothing.

⚠️ The email will **not arrive** until the Resend key is fixed (§0). The row appears in
`notifications` either way, which is how you tell the difference.

---

## 8. Settings

`https://mehfilbox.com/admin/c/<id>/settings`

| Control | Test |
|---|---|
| **Language** | Switch it, reload the guest page — changes immediately, and touches no other wedding |
| **Passcode** | Set one; a private window is asked for it. Five wrong tries locks the address for fifteen minutes |
| **Their own address** | Stored but not served until the CNAME exists |
| **Serving until** | Put it in the past → the renewal screen, never a broken link |
| **Take offline** | Guests get a neutral "not yet available"; the films stay |
| **Delete** | Asks you to type the couple's name |

Settings take effect **immediately** — they are not part of Publish (D-31). Style and content wait;
access controls and dates do not.

---

## 9. Your studio's look

https://mehfilbox.com/admin/studio

1. Set a colour, a typeface and a "Presented by".
2. Create a **new** wedding — it starts from those.
3. Open a wedding you already delivered — **unchanged**. Changing the studio default is not a
   retroactive repaint.

---

## 10. Handing over to the couple

On the Overview, **Hand this over to the couple**.

1. Enter their email, **Create handover link**. We do not email it — you send it, so you can see
   what you are sending.
2. Open the link in a private window. The couple sets their own password.
3. Afterwards: the wedding is **theirs**, and gone from your console entirely.
4. Your "Presented by" credit survives.

⚠️ With the mailer down, the handover email will not arrive. The link works regardless.

---

## 11. Platform console · needs §0

https://mehfilbox.com/admin/platform

| Check | Expect |
|---|---|
| Every org | Partners, couples, catalogue counts, **Access** column |
| One org | Its catalogues, **who can sign in**, storage, and an audit trail |
| **Suspend** | Confirms, asks a reason, and the studio cannot sign in |
| A suspended studio | Its console explains why and who to email — **its delivered weddings keep playing** |
| **Storage** | Set a quota; "Back to default" clears it rather than pinning today's number |
| Audit trail | Every write above appears with who did it and why |

✅ The one to verify deliberately: suspend a studio, then open one of its **published weddings** in
a private window. It plays. A billing dispute must never take a couple's wedding off the air.

---

## 12. The scheduled jobs

Run by GitHub Actions, not Vercel — Hobby allows two daily crons and `reconcile`/`usage` hold both.

| Job | Schedule | Trigger by hand |
|---|---|---|
| Notification drain | every 15 min | Actions → *Drain the notification queue* → Run workflow |
| Lifecycle + warnings | 03:40 UTC daily | same workflow |
| Synthetic guest check | hourly | Actions → *Synthetic guest check* |

Or directly:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://mehfilbox.com/api/cron/synthetic
```

✅ The synthetic check walks a guest's whole path — resolve, bundle, a ready film, a playback
token — and names the step that broke. `/api/health` only proves the app booted; it stayed green
through every real fault this product has had.

---

## 13. What to look at when something is wrong

```bash
# Did the app boot, and on which commit
curl -s https://mehfilbox.com/api/health

# Can a guest actually reach a playable film
curl -H "Authorization: Bearer $CRON_SECRET" https://mehfilbox.com/api/cron/synthetic

# What did we try to send, and what happened
#   Supabase → Table editor → notifications, newest first
```

`notifications` is the record: template, address, status, provider error. **`sent` means the
provider accepted it, not that anybody received it** — an undeliverable address still reads `sent`.
