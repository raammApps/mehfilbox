# 04 — Design System

Theme name: **Marquee** (the default). Read `12-compliance-and-risk.md §1` before changing
the accent or the wordmark — the design is deliberately full-fidelity streaming; only the
name and the mark are ours to keep distinct.

> **D-35, 12 September 2026 — Marquee is the *default* theme, no longer the only one.** The
> values in this document are Marquee's. `themes/registry.ts` holds seven built-in token sets and
> `16-platform-v2.md §4` is the contract every theme, built in or platform-authored, is held to.
> §2's contrast pairs apply to each theme's own surfaces rather than to black, and the ink on the
> accent is chosen per accent (white or near-black) rather than fixed white. Everything else here
> — the mechanics of §1b, the type scale, the motion — is what a theme does *not* change.

## 1. Design intent

**A prestige streaming service, for one couple.** Near-black surface, a single hot red accent,
posters carrying all the colour. The guest should feel, for a beat, that they have opened a
streaming app and found their friends' wedding on it. That double-take *is* the product.

Three rules that keep it from tipping into cheap pastiche:

1. **One accent, used sparingly.** Red earns its impact by being rare — the play button, the
   primary CTA, the active state. If more than ~5% of a screen is red, it reads like a sale
   banner rather than a title card.
2. **Photography carries the emotion; the chrome stays out of the way.** Near-monochrome UI
   so the couple's images do the work. This is also why the streaming look flatters ordinary
   phone photos: the scrim and grade do a lot of lifting.
3. **Indian-wedding warmth lives in the imagery and the poster gradients**, not in the
   chrome. Marigold and rose appear in generated posters and accents on cards; the shell
   stays black and red.

## 1b. Pattern fidelity — what makes it feel like a streaming app

Read this before deciding anything "looks too different". The streaming *feeling* comes from
mechanics, not from a red logo. Every mechanic below is required and is what the tickets
build. If the finished site does not produce a double-take, the fault will be in one of
these, not in the palette.

| # | Mechanic | Why it carries the feeling |
|---|---|---|
| 1 | **Profile gate on entry** — "who's joining?" tiles before content | The single most recognisable streaming moment. Instantly readable as the reference. |
| 2 | **Full-bleed billboard with a muted autoplaying trailer** and a bottom-to-top scrim | The "featured title" frame. Poster still paints first; video fades in when it can play through. |
| 3 | **Title, one-line synopsis, then two buttons** — one filled, one outlined | The exact hero information rhythm. Do not add a third button. |
| 4 | **Horizontal poster rows with a peeking card at the right edge** | The catalogue affordance. The half-visible card is the whole signal. |
| 5 | **Row eyebrow headings in small uppercase, tight above the cards** | Category labelling is what reads as "a library", not "a page". |
| 6 | **Card lift + hairline glow on hover, 180ms** | Pointer-device polish that says "premium app". |
| 7 | **Click-to-open modal over a dimmed page**, poster header at top, metadata row, then actions | The title-detail sheet. Not a page navigation. |
| 8 | **Different aspect ratios per row** (2:3 films, 16:9 story, 1:1 people) | Mixed shapes read as curation. A uniform grid reads as a template. |
| 9 | **Dark, near-black surface throughout**, imagery as the only saturated colour | The cinematic base. This is the biggest single contributor and it is fully retained. |
| 10 | **Progress bars and duration badges on cards** | The "continue watching" cue, doing its actual job. |

**Build all ten at full fidelity.** Red-on-black, poster rows, profile gate, episode framing —
this is the product. A guest's reaction in the first two seconds is the entire value
proposition, and it comes from these mechanics executed without hedging. Do not soften them.

**What is different, and only this:** the product name and wordmark carry no `-flix` suffix
and no imitation of another company's logotype, and the red is our own value rather than a
copied hex. See `12-compliance-and-risk.md §1` for why the line sits exactly there — it is a
name-and-mark question, not a design question, and it costs the guest experience nothing.

## 2. Colour tokens

Defined as CSS custom properties on `:root`, overridden per tenant. Dark is the default and
only surface for the guest site; the family dashboard uses the light set.

```css
:root {
  /* Surfaces — true cinematic black, a touch warm so skin tones don't go grey */
  --surface-0:  #0c0c0d;   /* page */
  --surface-1:  #17171a;   /* cards, nav when solid */
  --surface-2:  #202024;   /* raised, modal */
  --surface-3:  #2c2c31;   /* hover, hairlines on dark */

  /* Accent — hot red. The only saturated colour in the chrome. */
  --accent:     #d11a2a;
  --accent-hi:  #f0313f;   /* hover / focus */
  --accent-dim: #8e1220;
  --accent-ink: #ffffff;   /* text ON accent — 5.6:1 */

  /* Poster-side warmth. Used in generated art and card accents, never in the shell. */
  --marigold:   #f2933a;
  --rose:       #d4547e;
  --gold:       #e0b155;

  /* Text on dark */
  --text-hi:    #f5f5f6;   /* headings, 17.4:1 on surface-0 */
  --text-mid:   #c4c4c8;   /* body,     10.6:1 */
  --text-lo:    #93939a;   /* meta,      5.4:1 — minimum permitted */

  /* Semantic */
  --ok:         #46a758;
  --warn:       #d9a441;
  --error:      #f0313f;

  /* Light set — family dashboard only */
  --l-surface-0:#fafafa;
  --l-surface-1:#ffffff;
  --l-text-hi:  #131316;
  --l-text-mid: #45454b;
}
```

**One forbidden value: `#E50914` exactly.** Use `--accent: #d11a2a`. This is not a design
compromise — the two are visually interchangeable at a glance, and no guest will ever
perceive the difference. What it removes is the single most quotable exhibit in any
"they copied us pixel for pixel" conversation, at zero experiential cost. Same reasoning for
the logotype: build our own wordmark, never a stylised imitation of another company's.

### Contrast requirements

| Pair | Ratio | Min |
|---|---|---|
| `--text-hi` on `--surface-0` | 17.4:1 | 4.5 |
| `--text-mid` on `--surface-0` | 10.6:1 | 4.5 |
| `--text-lo` on `--surface-0` | 5.4:1 | 4.5 |
| `--accent-ink` on `--accent` | 5.6:1 | 4.5 |
| `--accent` on `--surface-0` | 4.1:1 | 3.0 (large/UI only) |

⚠ `--accent` on black is **4.1:1** — acceptable for buttons, icons and large text, but red
body copy on black is not permitted. Use `--text-mid` for anything under 19px. The contrast
validator (P0-03) enforces this; do not "fix" a failure by lightening the red into pink.

Ship `scripts/check-contrast.ts` for CI, **and** surface the same computation live in the
customizer's theme picker (doc 14 §5). A planner will hand over a brand pink that is
unreadable on black; they must be told at pick time, not by a build log they never see.

## 3. Typography

| Role | Family | Fallback | Usage |
|---|---|---|---|
| Display | **Archivo** 800/900, slight negative tracking | Impact, sans-serif | App name, billboard, title names |
| UI / body | **Inter** 400/500/600 | system-ui | Everything else |
| Devanagari | **Mukta** 700 (display) / 400 (body) | Noto Sans Devanagari | All Hindi content |
| Alt display | **Fraunces** 300 | Georgia, serif | Reserved for the Mandap and Minimal themes only |

A heavy grotesque, not a wedding script, is what makes the hero read as a title card rather
than an invitation. Set couple names tight (−0.02em) and large; the drama comes from scale
and weight against black. Devanagari uses Mukta rather than a serif so Hindi hero text
carries the same visual weight as English.

Self-host via `next/font/local`. Do not hotlink Google Fonts: it adds a third-party request
on a 3G first paint and creates a data-transfer question under DPDP.

### Type scale (mobile → desktop, fluid via `clamp()`)

| Token | Size | Line height | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | 40 → 76px | 1.02 | −0.02em | Couple names in hero |
| `display-lg` | 28 → 40px | 1.08 | −0.015em | Modal title name |
| `title` | 18 → 22px | 1.2 | −0.01em | Row headings |
| `body-lg` | 16 → 17px | 1.55 | 0 | Synopses, the letter module |
| `body` | 15 → 15px | 1.6 | 0 | Default. Never below 15px for content. |
| `meta` | 13px | 1.4 | 0.02em | Duration · category · date lines |
| `label` | 11px | 1.2 | 0.09em, uppercase | Row eyebrows, badges |

**Devanagari needs more leading.** Add `+0.12` to line-height on any element rendering
Hindi, or matras clip. Handle it with a `[lang="hi"]` rule, not by hand per component.

## 4. Spacing, radius, elevation

Space scale (px): `2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128`. Nothing off-scale.

| Token | Value |
|---|---|
| `radius-card` | 10px |
| `radius-modal` | 18px |
| `radius-pill` | 999px |
| `radius-input` | 8px |

Elevation on dark comes from **surface lightness plus a 1px hairline**, not drop shadows.
Shadows on a near-black background read as smudges.

```css
--edge: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
```

## 5. Motion

| Interaction | Duration | Easing |
|---|---|---|
| Card hover lift | 180ms | `cubic-bezier(.2,.7,.3,1)` |
| Modal open | 260ms | `cubic-bezier(.16,1,.3,1)` |
| Modal close | 180ms | `cubic-bezier(.4,0,1,1)` |
| Row arrow scroll | 420ms | `cubic-bezier(.22,1,.36,1)` |
| Hero Ken Burns | 20s, infinite alternate | `linear` |
| Page section reveal | 400ms, 60ms stagger | `cubic-bezier(.16,1,.3,1)` |

**`prefers-reduced-motion: reduce` disables Ken Burns, reveals and scroll easing entirely.**
Not "reduces" — disables. Modal open/close drop to a 100ms opacity fade so the state change
is still perceivable.

No motion may run during the first 1.5s after load on mobile; it competes with paint on
mid-range Androids and makes the site feel slower than it is.

## 6. Generated poster art

When a tenant supplies no image for a card, generate one deterministically from the card
slug so it is stable across builds:

- Two-stop linear gradient at 145°, picked from six curated pairs (marigold/rose,
  gold/aubergine, indigo/rose, emerald/gold, dusk/marigold, ink/gold).
- A single large low-opacity SVG motif (mandala, paisley, torana arch, lotus) — original
  geometry, generated from parameters, not traced from any existing artwork.
- Event name set in `display-lg`, bottom-left, with a scrim for contrast.
- Grain overlay at 3% opacity to avoid gradient banding on cheap panels.

These must look intentional, not like a fallback. Half of Phase 0 tenants will have no
photography ready.

## 7. Component tokens

| Component | Notes |
|---|---|
| Button, primary | `--accent` fill, `--accent-ink` text, `radius-pill`, height 48 mobile / 44 desktop. Only one on screen. |
| Button, secondary | Transparent fill, `--edge` border, `--text-hi` text |
| Input | `--surface-2` fill, `--edge`, 48px height, 16px font (prevents iOS zoom-on-focus) |
| Play button | Accent fill, white text, `radius-pill`, ▶ glyph. The only filled button on a screen. |
| Badge | `label` type, `--surface-3` fill, 4px radius |
| Focus ring | `2px solid var(--accent)`, `outline-offset: 2px`. Never removed. |

## 8. Iconography

Lucide, 1.5px stroke, 20px default. No icon appears without a text label except close (×),
back (‹ ›) and the language toggle. Icon-only navigation fails badly with the older-relative
audience this product explicitly serves.

## 9. Imagery direction (for planners)

Give partners this as a one-pager:

- Hero: horizontal, faces in the middle third, room at the bottom for text. Minimum 2400px wide.
- Posters: vertical 2:3, one clear subject, no text baked into the image.
- Avoid heavy filters; the site applies its own scrim and grade.
- Everything must survive being viewed at 360px wide in bright sunlight.
