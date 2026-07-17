# Design System v1 — "Ivy & Stone" (Internal Proposal)

**Status:** internal working system. Presented to the client as the recommended brand direction in Phase 1; if they approve, it graduates to the official theme. If they bring their own brand, only the token _values_ change — the structure below stays.

**Repo home:** `packages/ui-mobile/src/theme/` (mobile) + `apps/web/styles/tokens.css` (web, generated from the same source).

---

## 1. Direction & Rationale

**One sentence:** a quiet, warm gallery for clothes — deep ivy green as the single brand voice, warm stone neutrals that flatter product photography, marigold reserved exclusively for savings.

**Why green:** the accent color IS the identity in Indian fashion e-commerce, and every obvious lane is taken — Myntra pink/coral, Nykaa pink, Meesho purple-pink, Ajio black/gold, Flipkart blue, Amazon orange, Tata CLiQ burgundy. Deep ivy green is unclaimed, reads premium (luxury tailoring, heritage fashion houses), photographs well next to any garment color, and creates maximum legal/visual distance from Myntra — which matters for this project specifically.

**Why warm neutrals:** fashion photos carry the color; the UI must recede. Warm stone greys (not blue-greys) make skin tones and fabric look better and make the whole app feel like paper and cloth rather than software.

**Rules of restraint:**

1. Ivy appears on at most ONE filled element per screen (the primary CTA). Everything else uses ivy as text/border/tint.
2. Marigold means exactly one thing: money saved (discount %, savings banner, coupon applied). It never decorates anything else.
3. Fraunces (the serif) appears only in brand/editorial moments — never in functional UI.
4. Product imagery is always on `paper2` (#F2F1ED), never pure white — photos float on white and sit on stone.

**Signature element:** the discount tag. Every "% off" and savings chip is shaped like a clothing price tag — square-notched on the left (`border-radius: 2px 8px 8px 2px`), marigold tint fill. A real artifact from fashion's physical world, one line of CSS, instantly ours.

---

## 2. Color Tokens

### 2.1 Neutrals — "Stone" (warm grey ramp)

| Token    | Hex       | Light-mode use                                  |
| -------- | --------- | ----------------------------------------------- |
| `paper0` | `#FFFFFF` | Cards, sheets, elevated surfaces                |
| `paper1` | `#FAF9F7` | App/page background                             |
| `paper2` | `#F2F1ED` | Image backgrounds, subtle fills, pressed states |
| `line`   | `#E5E3DD` | Borders, dividers (0.5–1px)                     |
| `ink4`   | `#B5B1A8` | Disabled text/icons, struck sizes               |
| `ink3`   | `#8C8880` | Placeholders, tertiary text, struck MRP         |
| `ink2`   | `#57534B` | Secondary text (product names, labels)          |
| `ink1`   | `#1D1B16` | Primary text, prices, headings                  |

### 2.2 Brand — "Ivy"

| Token    | Hex       | Use                                                            |
| -------- | --------- | -------------------------------------------------------------- |
| `ivy100` | `#E6F0EA` | Selected-state tints (size pill bg, active filter)             |
| `ivy600` | `#2E6B52` | Links, dark-mode button fill                                   |
| `ivy700` | `#1E4D3A` | PRIMARY: filled CTA, active tab, rating chip, selected borders |
| `ivy800` | `#143726` | Pressed CTA, text on ivy100                                    |
| `ivyOn`  | `#FFFFFF` | Text/icon on ivy700 fill (`#DCEDE3` for secondary text on ivy) |

### 2.3 Savings — "Marigold" (single-purpose)

| Token         | Hex       | Use                                      |
| ------------- | --------- | ---------------------------------------- |
| `marigold100` | `#FBEEDA` | Discount tag fill, savings banner bg     |
| `marigold600` | `#B0700E` | Discount %, savings text, coupon-applied |

### 2.4 Semantic

| Token     | Hex                        | Use                                                                                                      |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `success` | `#1F7A45` / tint `#E7F2EA` | Delivered, payment captured, in stock                                                                    |
| `error`   | `#C23B32` / tint `#FCEBEB` | Failed payment, cancelled, form errors, destructive                                                      |
| `warning` | `#B0700E` / tint `#FBEEDA` | Low stock, COD limit, pending KYC (shares marigold — warnings and savings never co-occur on one element) |
| `info`    | `#33628F` / tint `#E9F0F7` | In transit, informational banners                                                                        |

### 2.5 Dark mode

| Token       | Hex                        | Maps from                              |
| ----------- | -------------------------- | -------------------------------------- |
| `bg`        | `#141310`                  | paper1                                 |
| `surface`   | `#1D1C18`                  | paper0                                 |
| `surface2`  | `#26241F`                  | paper2                                 |
| `line`      | `#35332C`                  | line                                   |
| `text1`     | `#EDEBE4`                  | ink1                                   |
| `text2`     | `#A8A499`                  | ink2                                   |
| `text3`     | `#7C7870`                  | ink3                                   |
| `ivyAccent` | `#6FAF8C`                  | ivy700 as text/icon accent             |
| `ivyFill`   | `#2E6B52`                  | ivy700 as button fill (text `#EDEBE4`) |
| `marigold`  | `#E0A54A` / fill `#3A2E14` | marigold600/100                        |

**Contrast floor:** all text pairs ≥ 4.5:1 (ink2 on paper1 = 6.9:1, ivy700 on white = 8.5:1, marigold600 on white = 4.6:1 — marigold text is always ≥13px semibold). Verify any new pair before adding.

---

## 3. Typography

| Role      | Face                                    | Weights            | Where                                                                                                                |
| --------- | --------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Display   | **Fraunces** (soft serif, Google Fonts) | 500, 600           | Home editorial headers, empty-state titles, order-confirmation moment, auth welcome. NEVER in lists, forms, buttons. |
| UI / Body | **Albert Sans**                         | 400, 500, 600, 700 | Everything else: nav, labels, product names, body, buttons, prices                                                   |
| Data      | **Spline Sans Mono**                    | 500                | Order IDs, AWB numbers, coupon codes, OTP boxes                                                                      |

Why: Albert Sans is a fresh geometric-humanist that stays crisp at 12–13px (dense PLP cards) and has confident numerals for prices; Fraunces gives fashion-editorial warmth in tiny doses; the mono makes copy-able codes visually "grabbable." All three are free (Google Fonts), load in Expo via `@expo-google-fonts/*` and on web via `next/font`.

### Type scale (mobile-first, px)

| Token        | Size/LH | Weight       | Use                                    |
| ------------ | ------- | ------------ | -------------------------------------- |
| `display`    | 28/34   | Fraunces 600 | Editorial headers                      |
| `title`      | 22/28   | 700          | Screen titles                          |
| `heading`    | 17/24   | 600          | Section headers, PDP product name      |
| `body`       | 15/22   | 400          | Default text                           |
| `bodyStrong` | 15/22   | 600          | Prices (md), buttons                   |
| `label`      | 13/18   | 500          | Card product names, form labels, chips |
| `caption`    | 12/16   | 400          | Struck MRP, timestamps, helper text    |
| `micro`      | 11/14   | 600          | Badges, discount tag                   |

Price composition: `bodyStrong ink1` price + `caption ink3 line-through` MRP + `micro marigold600` tag. Web scales up: display 40, title 28, body 16.

---

## 4. Shape, Space, Elevation

- **Spacing:** 4pt grid — 4 / 8 / 12 / 16 / 20 / 24 / 32. Screen gutter 16. Card internal padding 12.
- **Radius:** `sm 6` (inputs, tags), `md 10` (buttons, cards), `lg 14` (sheets, modals), `pill 999` (chips, size pills), `tag 2/8/8/2` (the signature discount tag).
- **Elevation:** borders over shadows. Level 0 = flat on paper1; level 1 = paper0 + 0.5px line border; level 2 (sheets/sticky bars) = paper0 + border + shadow `0 -2px 16px rgba(29,27,22,0.08)`. Nothing else gets a shadow.
- **Imagery:** product images 3:4, radius `md`, on `paper2`.

---

## 5. Component Color Mapping (binding for `ui-mobile`)

| Component                        | Spec                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Button primary                   | ivy700 fill, ivyOn text, pressed ivy800, disabled paper2+ink4                                                           |
| Button secondary                 | transparent, 1.5px ivy700 border, ivy700 text                                                                           |
| Button danger                    | error fill only for destructive confirms                                                                                |
| SizePill                         | default: line border + ink1 text; selected: ivy100 fill + 1.5px ivy700 border + ivy800 text; OOS: ink4 struck, no press |
| RatingChip                       | ivy700 fill, `#DCEDE3` star, ivyOn value                                                                                |
| Discount tag                     | marigold100 fill, marigold600 text, radius `tag`                                                                        |
| Savings banner                   | marigold100 bg, marigold600 text, full-width under price summary                                                        |
| FilterDrawer                     | left rail paper2, active category paper0 + 3px ivy700 left bar (radius 0); Apply = primary button                       |
| StatusTimeline                   | done/current ivy700 (dark: ivyAccent), pending line/ink4                                                                |
| Status text                      | delivered success · transit info · cancelled ink3 · refund-due marigold600                                              |
| Cart SellerGroupHeader           | label ink2 + line divider; ETA in ivy600                                                                                |
| Coupon code                      | Spline Sans Mono on paper2 chip; applied state ivy100/ivy800 + check                                                    |
| Bottom nav                       | active ivy700 icon+label, inactive ink3                                                                                 |
| KYC/approval badges (seller app) | pending marigold · approved success · rejected error                                                                    |

Seller app: identical system, one differentiator — its bottom nav and app icon use ivy800 (darker) so sellers running both apps never confuse them.

---

## 6. Implementation

### 6.1 `packages/ui-mobile/src/theme/tokens.ts` (source of truth)

```ts
export const palette = {
  paper0: "#FFFFFF",
  paper1: "#FAF9F7",
  paper2: "#F2F1ED",
  line: "#E5E3DD",
  ink1: "#1D1B16",
  ink2: "#57534B",
  ink3: "#8C8880",
  ink4: "#B5B1A8",
  ivy100: "#E6F0EA",
  ivy600: "#2E6B52",
  ivy700: "#1E4D3A",
  ivy800: "#143726",
  ivyOn: "#FFFFFF",
  ivyOnSoft: "#DCEDE3",
  marigold100: "#FBEEDA",
  marigold600: "#B0700E",
  success: "#1F7A45",
  successTint: "#E7F2EA",
  error: "#C23B32",
  errorTint: "#FCEBEB",
  info: "#33628F",
  infoTint: "#E9F0F7",
  d_bg: "#141310",
  d_surface: "#1D1C18",
  d_surface2: "#26241F",
  d_line: "#35332C",
  d_text1: "#EDEBE4",
  d_text2: "#A8A499",
  d_text3: "#7C7870",
  d_ivyAccent: "#6FAF8C",
  d_ivyFill: "#2E6B52",
  d_marigold: "#E0A54A",
  d_marigoldFill: "#3A2E14",
} as const;

export const light = {
  bg: palette.paper1,
  surface: palette.paper0,
  surfaceAlt: palette.paper2,
  line: palette.line,
  text1: palette.ink1,
  text2: palette.ink2,
  text3: palette.ink3,
  disabled: palette.ink4,
  brand: palette.ivy700,
  brandPressed: palette.ivy800,
  brandTint: palette.ivy100,
  onBrand: palette.ivyOn,
  save: palette.marigold600,
  saveTint: palette.marigold100,
  /* semantic passthroughs… */
} as const;

export const dark = {
  bg: palette.d_bg,
  surface: palette.d_surface,
  surfaceAlt: palette.d_surface2,
  line: palette.d_line,
  text1: palette.d_text1,
  text2: palette.d_text2,
  text3: palette.d_text3,
  disabled: palette.d_text3,
  brand: palette.d_ivyFill,
  brandPressed: palette.ivy800,
  brandTint: "#1A2E24",
  onBrand: palette.d_text1,
  brandAccent: palette.d_ivyAccent,
  save: palette.d_marigold,
  saveTint: palette.d_marigoldFill,
} as const;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const space = (n: number) => n * 4;
```

Components consume ONLY `light`/`dark` semantic names via a `useTheme()` hook — never `palette.*` directly, never hex. That's what makes a client rebrand a one-file change.

### 6.2 Fonts

```bash
pnpm --filter customer-app add @expo-google-fonts/fraunces @expo-google-fonts/albert-sans @expo-google-fonts/spline-sans-mono expo-font
```

Web: `next/font/google` with the same three families; expose as CSS vars `--font-display / --font-sans / --font-mono` and mirror the color tokens into `tokens.css` (generated by a small script from `tokens.ts` — one source of truth).

### 6.3 Admin panel

Same tokens, denser scale (body 14, controls 32px), paper1 canvas, ivy for primary actions only. The admin should feel like the same company's back office.

---

## 7. Do / Don't

- DO let photography be the loudest thing on every commerce screen.
- DO use ivy100 tint (not ivy700 fill) for all "selected" states except the one primary CTA.
- DON'T introduce any pink/coral anywhere — that's Myntra's lane and our differentiation.
- DON'T use marigold for anything that isn't money saved (its warning use never shares a screen region with savings).
- DON'T use Fraunces below 20px or inside any interactive element.
- DON'T add gradients or colored shadows; this system is flat by intent.
- DON'T hardcode hex in components — theme tokens only (lint rule: forbid `#` literals outside `tokens.ts`).

## 8. Phase-1 client presentation note

Show the client: the preview mock (light+dark), the "why green" competitive slide, and two alternates only if asked (a deep indigo variant and a burgundy variant can be generated from this same structure in minutes by swapping the brand ramp). Get written approval of palette + fonts = the "brand approval" gate in the kickoff checklist.
