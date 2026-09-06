# Go live on heirloomfilms.in

The two things that have to happen at Hostinger, in order, and what changes here afterwards.

Everything I could do from this side is done: the domain is attached to the Vercel project and
verified, and the GitHub integration is reconnected. **What is left needs your Hostinger DNS panel
and one provider account.**

> **Read the warning in §1 first.** The domain already carries live email, and one careless record
> takes it down.

---

## What is already true

| | |
|---|---|
| Domain attached to the Vercel project | ✅ `heirloomfilms.in` → project `heirloomfilms` |
| Ownership verified | ✅ same Vercel scope |
| GitHub integration | ✅ reconnected — push-to-deploy works again now the repo is public |
| Tenancy mode | ✅ `path` — needs **one** record, not a wildcard |

**Path mode is the right choice and it is not just about effort.** Subdomain mode
(`aanya.heirloomfilms.in`) needs a wildcard, and Vercel requires the domain's **nameservers** to
point at them for that. Your domain currently runs Hostinger's nameservers and carries **live MX
records** — handing the nameservers to Vercel moves all DNS, including mail, and is how a domain's
email goes dark for a day. Path mode changes two A records and touches nothing else.

---

## 1. The DNS you have now

```
A     @    2.57.91.91                                    ← Hostinger parking
MX    @    5  mx1.hostinger.com
MX    @    10 mx2.hostinger.com
TXT   @    v=spf1 include:_spf.mail.hostinger.com ~all
NS         helios.dns-parking.com / aster.dns-parking.com
```

> **Do not delete the MX records, and do not add a second SPF record.**
>
> Two SPF records on one domain is a `permerror` under the spec, and mail silently starts failing
> — it is the most common way a first email setup breaks. There is exactly **one** SPF TXT record
> on a domain, ever. When you add a sending provider you *edit* the existing one.

---

## 2. Point the domain at Vercel — ✅ done

`dig +short heirloomfilms.in` now returns both Vercel addresses. Kept for the record:

In **Hostinger → Domains → DNS / Nameservers**:

**Delete** the existing `A @ 2.57.91.91`, then **add two**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `216.198.79.1` | default |
| A | `@` | `64.29.17.1` | default |

Optionally, so `www` works:

| Type | Name | Value |
|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com` |

**Leave MX, TXT and NS exactly as they are.** A records and MX records are independent — changing
where the website points does not touch where mail goes.

Propagation is usually minutes. Check with:

```bash
dig +short heirloomfilms.in A
```

You want `216.198.79.1` and `64.29.17.1` back.

---

## 3. Email — pick a provider and verify the domain

Supabase's built-in sender allows a few messages an hour and is meant for development. Hitting it
returns `over_email_send_rate_limit`, which is what killed the first live registration attempt.

**Recommended: [Resend](https://resend.com)** — simplest setup, free tier covers our volume, good
deliverability. Amazon SES is cheaper at volume and considerably more work.

Free tier: **3,000 emails/month, 100/day, one domain.** Pro is $20/mo for 50,000 and removes the
daily cap. Registration, password reset and handover traffic sit far inside the free tier; the
*daily* 100 is the one to watch, because a bulk expiry-warning run (N-24) is bursty by nature.

### The SPF merge is **not** needed — correcting the earlier note in this file

Resend puts SPF and MX on a **`send` subdomain**, not on the root. So `heirloomfilms.in`'s existing
`v=spf1 include:_spf.mail.hostinger.com ~all` is left completely alone, and your Hostinger mail is
never in the blast radius. The two-SPF-records warning in §1 still holds as a general rule — it
just does not come up with this provider.

### Steps

1. Create the account at [resend.com](https://resend.com) and add `heirloomfilms.in` as a domain.
2. Resend shows three records. At **Hostinger → Domains → your domain → DNS / Nameservers**:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | MX | `send` | *(Resend's MX value)* — priority `10` | 3600 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | 3600 |
   | TXT | `resend._domainkey` | *(Resend's DKIM value)* | 3600 |

   > **Hostinger appends the domain to the Name field itself.** Enter `send`, never
   > `send.heirloomfilms.in`, or you end up with `send.heirloomfilms.in.heirloomfilms.in`. Same for
   > `resend._domainkey`. This is the single most common reason verification never completes.
   >
   > Copy the DKIM value whole — it is long, and a truncated paste fails silently.
   >
   > Do not reuse priority `10` if an MX record already has it. Your existing mail uses `5` and
   > `10` on the **root**; these are on `send`, so they do not collide — but check.

3. Add a DMARC record, which nothing has yet:

   ```
   Type: TXT   Name: _dmarc   Value: v=DMARC1; p=none
   ```

   `p=none` **monitors without rejecting** — start here. Tighten to `quarantine` only once the
   reports show everything legitimate is passing.

   > **Exactly one `_dmarc` record, and no placeholder address.** Two DMARC records make resolvers
   > ignore the policy altogether — the same failure as two SPF records. This bit us on the first
   > pass: a second record went in carrying a literal `rua=mailto:you@heirloomfilms.in` copied from
   > this file, which is both a duplicate *and* a mailbox that does not exist, so the aggregate
   > reports it asks for would bounce.
   >
   > Add `rua=mailto:<a real mailbox on this domain>` later, as a single combined record. A `rua`
   > pointing at another domain (a Yahoo or Gmail address) is ignored unless that domain publishes
   > an authorisation record for us, so it must be an address here.

4. Click **Verify DNS Records** in Resend. Usually minutes; allow up to 72 hours.
5. Create an **API key** in Resend — that string is the SMTP password below.

### Checking it from outside, which is the only check that counts

Resend reporting "Verified" says its own three records resolve. It says nothing about whether the
existing mail survived, and that is the part with consequences:

```bash
dig +short MX heirloomfilms.in          # must still be mx1/mx2.hostinger.com
dig +short TXT heirloomfilms.in         # must still be the Hostinger SPF, unchanged
dig +short TXT _dmarc.heirloomfilms.in  # must return exactly ONE record
```

The DMARC line is worth running twice: the duplicate that broke it the first time was invisible in
both dashboards, and only showed up in `dig`.

### Then wire it into Supabase

**Supabase → Project Settings → Authentication → SMTP Settings**, enable custom SMTP, and enter:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | **`587`** |
| Username | `resend` — literally that word, not your email |
| Password | your Resend **API key** (`re_…`) |

> **Use 587.** Resend accepts 465 too, but 587/STARTTLS is the pairing Supabase is happiest with.
>
> **When it fails, do not guess — read `Logs → Auth`.** Supabase reports every SMTP failure as the
> same opaque `500 unexpected_failure / Error sending recovery email`, whatever actually went
> wrong. The auth log holds the real SMTP code, and it is the difference between a five-minute fix
> and an afternoon:
>
> | Code | Means |
> |---|---|
> | `535 Authentication credentials invalid` | Username or API key wrong. Nothing else — 535 happens at `AUTH`, before the message is offered, so the sender address and the key's domain scope cannot be the cause. |
> | `403` / `422` at send | Auth was fine; the **From** address is not on a verified domain, or the key is scoped to a different one. |
> | timeout | Host or port unreachable. |
>
> We lost a round trip here by treating a `500` as a port problem and switching 465→587. The log
> said `535` both times: the credential was wrong from the start, and the port was never involved.
> Resend reveals an API key's value **once**, at creation — copy it then, or create a new one.

#### Test the credential outside Supabase before touching Supabase again

Two round trips were spent adjusting settings on the strength of a `500` that says nothing. The
way out is to prove the credential independently — `scripts/` has no home for it, so it lives in
the scratchpad, but the technique is worth keeping:

```python
import smtplib
s = smtplib.SMTP("smtp.resend.com", 587, timeout=20)
s.ehlo(); s.starttls(); s.ehlo()
s.login("resend", "<the API key>")      # 535 here → the key is wrong, full stop
s.sendmail("hello@heirloomfilms.in", ["you@…"], "Subject: test\n\nbody")
```

Splitting connect / STARTTLS / AUTH / send apart turns one opaque failure into a specific one.
When AUTH and send both succeed with a key while Supabase still returns `500` with the "same" key,
the conclusion is forced and needs no further guessing: **the value stored in Supabase is not that
key**. Re-paste it and check for a truncated copy or a trailing space.

Two settings on the same screen that matter:

- **Sender address** — use something a couple will trust, e.g. `hello@heirloomfilms.in`. Not
  `noreply@`: this email asks somebody to set a password for their own wedding, and `noreply`
  reads like a phishing attempt.
- **Site URL** — set it to `https://heirloomfilms.in`. Left at its default, a partner confirms
  their account and lands somewhere that is not this deployment.

---

## 4. The switchover — ✅ done, except the webhook

DNS resolved to both Vercel addresses, the certificate issued, and:

| | |
|---|---|
| `ROOT_DOMAIN` on Vercel | ✅ `heirloomfilms.in`, redeployed |
| Certificate | ✅ issued, valid to 12 Nov 2026 |
| `heirloomfilms.in/api/health` | ✅ `supabase` + `bunny` |
| `heirloomfilms.in/admin` | ✅ 200 |
| Bunny `WebhookUrl` | ⬜ **still on the old URL** |

### The webhook is still yours to move

Changing a library's `WebhookUrl` needs Bunny's **account** API key. This repo only holds the
Stream key (`BUNNY_API_KEY`), by design — so it cannot be done from here.

**Bunny dashboard → Stream → library `724076` → API / Webhook →** set:

```
https://heirloomfilms.in/api/webhooks/bunny
```

> **Nothing is broken right now, and that is the trap.** `marquee-film-pub.vercel.app` is still
> attached to the project and still serving the *current* build, so transcode notifications keep
> arriving. That is luck, not design: the alias list already holds several `marquee-film-*` names
> pinned to deployments hours and days old. The day the old alias lands on a stale deployment, the
> webhook starts answering `200` from superseded code — uploads succeed, transcoding finishes, and
> titles simply never leave `processing`. A webhook that looks healthy is the hardest kind to
> debug, so move it while it is still working.

It must point at the **stable domain**, never at a `heirloomfilms-<hash>.vercel.app` URL, for the
same reason.

### Still unverified from here

`pnpm preflight` and a real end-to-end playback check have **not** been run against the new domain
— both were blocked in the session that made the switch. Run `pnpm preflight` once the webhook
moves; that plus §5 step 3 is the actual proof.

---

## 5. Verifying it actually worked

```bash
curl -s https://heirloomfilms.in/api/health
```

Expect `"drivers":{"data":"supabase","video":"bunny"}` and a `version` matching the deployed
commit.

Then, in order, because each catches something different:

1. **Sign in** at `https://heirloomfilms.in/admin`.
2. **Open a catalogue's public link** from the console and check the address now reads
   `heirloomfilms.in/c/<slug>`.
3. **Upload one short film** and watch it reach `ready` on its own — that is the only real proof
   the webhook is pointed correctly.
4. **Register a test partner** at `/admin/register` and confirm the email arrives, from the right
   sender, not in spam.

Step 4 is the one that proves N-17. Everything else can pass with email still broken.

> **Registering a partner does not test email, and this misled us once already.** The project has
> **Confirm email switched off**, so `signUp` auto-confirms the account in about 50ms and sends
> nothing at all. The API returns `201`, the console works, and the provider's log stays empty —
> which reads like a delivery problem when in fact nothing was ever sent.
>
> To test SMTP without changing any setting, trigger a **password reset**, which sends regardless
> of that toggle:
>
> ```bash
> curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/recover" \
>   -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' \
>   -d '{"email":"you@heirloomfilms.in"}'
> ```
>
> An empty `200` means it sent. A `500` with `Error sending recovery email` means SMTP is
> misconfigured — check the port first.

### Decide: should confirmation be on?

With it off, anyone can register a partner account using an email address they do not own, and
they are signed in immediately. That is convenient for a demo and wrong for a product that emails
couples on a studio's behalf. Turning it on (**Authentication → Sign In / Providers → Email →
Confirm email**) does not break registration — `signUp` only reads `data.user`, never the session,
so the org and operator are still created — but the partner then cannot sign in until they click
the link, and the register screen currently does not say so. Worth pairing with a copy change.

---

## What this unblocks

| | |
|---|---|
| **N-11** | The domain |
| **N-17** | SMTP — and with it registration and password reset |
| **N-21** | The migration email at handover |
| **N-24** | Renewal, which needs expiry warnings, which need email |

`PRODUCT.md` §7 lists SMTP as blocking more than anything else on the list. This is that.

---

# The Mehfilbox switch (N-52)

`mehfilbox.com` is canonical, `mehfilbox.in` redirects, and `heirloomfilms.in` keeps resolving —
it is in guests' phones and gets redirected, never dropped.

**Done:** the code rename, the Vercel project (`mehfilbox`), the GitHub repository
(`raammApps/mehfilbox`), and both new domains attached to the project. Push-to-deploy verified
after both renames, and the stable alias checked immediately after the project rename because last
time it silently kept serving the previous commit.

## 1. DNS — yours

Both domains are at **Hostinger** (`*.dns-parking.com` nameservers), parked on `A 2.57.91.91` —
the same starting state `heirloomfilms.in` had. **Neither carries MX records**, so the live-mail
caution that dominated the first launch does not apply: there is no existing email to protect on
these two.

At **Hostinger → Domains → DNS / Nameservers**, on **each** domain, delete the parking
`A @ 2.57.91.91` and add:

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| A | `@` | `64.29.17.1` |

These are the records currently serving `heirloomfilms.in`, so they are proven rather than
guessed — `vercel domains inspect` still offers its older single apex IP, which also works but is
not what is live here.

**Do not delegate nameservers to Vercel.** `path` mode needs these two records and nothing else,
and delegation would move any mail on the domain. Same reasoning as the first launch.

## 2. Resend — yours

`mehfilbox.com` needs verifying as a sending domain before `hello@mehfilbox.com` can send. Three
records, and **the `send` subdomain trap in §3 applies again**: Hostinger-style panels append the
domain to the Name field, so enter `send`, never `send.mehfilbox.com`.

Until it is verified, leave Supabase's SMTP sender as `hello@heirloomfilms.in` — that domain is
verified and sending. Switching the sender before the new domain verifies means registration mail
stops.

## 3. Then tell me, and I will do the rest

**In one sitting, because apart they fail silently:**

1. `ROOT_DOMAIN` → `mehfilbox.com`, redeploy.
2. The Bunny library's `WebhookUrl` → `https://mehfilbox.com/api/webhooks/bunny`. Left behind, it
   keeps answering from the old host: uploads succeed, transcoding finishes, titles never leave
   `processing`.
3. Supabase **Site URL** → `https://mehfilbox.com`, and the redirect allow-list. Verified by
   reading the delivered message, not by trusting the dashboard — that is how the last wrong Site
   URL was found.
4. The photo zone: `mehfilbox-photos`, copy, repoint, delete. `scripts/repoint-photo-cdn.ts` does
   it; `photos.url` holds absolute URLs, so the rows are rewritten too.

## 4. What proves it worked

The same four as the first launch, plus one: **`heirloomfilms.in` must still resolve and redirect
to `mehfilbox.com`.** Every link already sent to a guest points at it, and a wedding page that
404s because the company changed its name is the one failure this product cannot explain away.
