# Job Radar Design System

A bold, technical look modeled on TypeUI's **Contemporan** style: **electric ultramarine** brand surfaces, **crisp white** bordered content, a **lime** highlight, **Playfair Display** serif headings, **Geist Mono** for the whole app UI, and exact **1px corners**. It's flat and precise.

> The values below were measured from Contemporan's live preview (typeui.sh/design-skills/contemporan): colors, fonts, radius, borders. This file is our own write-up, since the original skill file is a paid download.

## Principles

1. **Blue frames, white works.** Full-bleed ultramarine for the hero, header band and footer. Everything you read or act on sits on white with 1px cool-grey borders.
2. **Lime means "look here".** It's only for new or urgent signals: the "New" tag, the new-jobs count, focus rings on blue. Text on lime is always `--heading` (17.6:1). Never use lime text on white.
3. **Serif speaks, mono works.** Playfair Display for marketing and page headlines. Geist Mono for *everything else*: app headings, labels, buttons, tables, numbers, body copy in the app.
4. **Exact, not soft.** Radius is 1px on every component (avatars and status dots are the only round things). Borders instead of shadows.

## Color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--brand` | `#0000F2` | `#0000F2` | Hero/footer surfaces, primary buttons, active tab text, links (9.2:1 on white) |
| `--brand-strong` | `#0000C2` | `#0000C2` | Primary hover/pressed |
| `--brand-soft` | `#DDE1FF` | `#1A1A4A` | Selected rows, active tab underline area |
| `--brand-softer` | `#F1F3FF` | `#12123A` | Subtle brand tint backgrounds |
| `--lime` | `#EDFF45` | `#EDFF45` | "New" tag, highlights, focus ring on brand surfaces |
| `--heading` | `#0A0A23` | `#F4F5FB` | Headings, strong numbers |
| `--body` | `#33374A` | `#E6E8F5` | Body text (11.8:1) |
| `--body-subtle` | `#6A6E85` | `#9C9FB8` | Meta, labels, timestamps (5.0:1) |
| `--bg` | `#FFFFFF` | `#07071C` | Page background |
| `--surface` | `#FFFFFF` | `#0D0D26` | Cards, panels, tables |
| `--surface-card` | `#F4F6FE` | `#11112E` | Tinted cards/stat tiles |
| `--surface-muted` | `#EDEFFA` | `#171736` | Secondary buttons, active nav item, table header |
| `--border` | `#DDE1F5` | `#26264A` | Default 1px borders |
| `--border-strong` | `#C4C8E0` | `#3A3A66` | Inputs, emphasized dividers |
| `--link` | `#0000F2` | `#A5AAFF` | Links on page surfaces (dark: 9.3:1) |
| `--success` / soft | `#15803D` / `#ECFDF3` | `#4ADE80` / `#0F2A1B` | Applied, verified live, up-trends |
| `--warning` / soft | `#B45309` / `#FFFAEB` | `#FBBF24` / `#2A1F08` | Deadline ≤ 14 days |
| `--danger` / soft | `#C81E1E` / `#FFF1F2` | `#F87171` / `#2A0E12` | Deadline ≤ 3 days, closed job, errors |

Status is never shown by color alone. Always pair it with a word or icon ("3 days left", "Closed").

## Typography

Load via `next/font/google`: **Playfair Display** (600, 700) and **Geist Mono** (400, 500, 600, 700).

| Role | Font | Size / line-height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Hero display | Playfair Display | 54/60 (desktop), 38/44 (mobile) | 700 | -0.5px |
| Section headline | Playfair Display | 40/46 | 600 | -0.5px |
| Card headline (marketing) | Playfair Display | 20/28 | 600 | normal |
| App page title ("Dashboard") | Geist Mono | 28/36 | 700 | normal |
| App section title | Geist Mono | 18–20/28 | 500–600 | normal |
| Stat number | Geist Mono | 28/32 | 700 | normal |
| Body (app) | Geist Mono | 14/22 | 400 | normal |
| Label / button / nav | Geist Mono | 14/20 | 500 | normal |
| Small / meta / eyebrow | Geist Mono | 12/16 | 400–500 | Eyebrows UPPERCASE, +0.04em |

Use `font-variant-numeric: tabular-nums` for countdowns, counts and dates.

## Space, lines and shape

- **Spacing:** 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96. Cards use 24px padding. Stat grids use 16–24px gaps.
- **Radius:** `1px` on buttons, inputs, cards, badges, tabs, modals. `9999px` only for avatars and status dots.
- **Borders:** 1px `--border` on cards, tables and sections. Inputs use `--border-strong`.
- **Shadows:** none by default. Use one soft shadow only for floating menus/popovers: `0 4px 12px #0a0a231a, 0 1px 3px #0a0a2314`.
- **Layout:** max width 80rem (1280px), navbar 64px tall, 16px side gutters on mobile. App = left sidebar (about 260px) + content. The dashboard uses a grid of bordered stat cards.
- **Motion:** 120ms ease-out on color/border only. No motion under `prefers-reduced-motion`.

## Components

**Top bar (app).** A white bar with a bottom border. On the left is a logo tile: a brand-blue square with a white letter, 1px radius, next to the product name in Geist Mono 600. On the right are the "Last checked 4 min ago" status (mono 12, `--body-subtle`, which turns into a danger badge if polling is stale) and an avatar.

**Hero / marketing band.** Full-bleed `--brand`, Playfair headline in white, mono subcopy in white. Includes an announcement pill with a lime "New" tag and a white-on-brand-strong label. The primary CTA is a white button with a brand label. The secondary is `--brand-strong` with a white label.

**Sidebar nav.** Mono 14 items with 16px icons. Active item: `--surface-muted` background, `--heading` text, **3px brand inset left rule** (`box-shadow: inset 3px 0 0 var(--brand)`). Group labels are mono 12 uppercase `--body-subtle`.

**Buttons (40px tall, 44px on touch, 1px radius, mono 14/500).**
- Primary: `--brand` bg, white text, hover `--brand-strong`. Optional leading icon ("+ New report").
- Secondary: `--surface-muted` bg, `--heading` text, no border.
- Outline: white bg, 1px `--border-strong`.
- Ghost/link: `--link` text.

**Stat card.** White, 1px `--border`, 24px padding. The label is mono 14 `--body-subtle`, the value is mono 28/700 `--heading`, and the meta line is mono 12. A top-right trend badge uses a soft background plus a 1px tinted border ("↗ 12.4%" success, "↘ 2.1%" danger). An optional sparkline goes in the bottom right.

**Job card.** White, 1px `--border`. Top row: company (mono 12 `--body-subtle`) + "verified 6 min ago". Title in mono 16/600 `--heading`. Badge row: role family, level, degree, location tier. A new job gets a lime "NEW" tag. Actions: Apply (primary), Save (secondary), Hide (ghost). Grouped listings show "+3 locations".

**Badges / tags.** Mono 12, 1px radius, 2px 8px padding. Neutral: `--surface-muted` bg + `--body`. Status: soft bg + 1px border tinted from the status color + status text. New: lime bg + `--heading`.

**Tabs.** Mono 14 with icons. Active: `--brand` text + 2px `--brand` underline. Inactive: `--body-subtle`.

**Tables.** Header row `--surface-muted`, mono 12 uppercase `--body-subtle`. Rows separated by 1px `--border`, hover `--brand-softer`. 44px rows.

**Grad Programs deadline row.** School/program in mono 14 `--heading`, status badge, and a right-aligned countdown in mono tabular ("23 days"). At ≤ 14 days: warning-soft row background + warning text. At ≤ 3 days: danger-soft + danger text. Past deadlines: `--body-subtle` + "Closed".

**Deadline banner.** A row of 3 bordered cells under the top bar: school (mono 12 subtle), program (mono 14 heading), days left (mono 28/700).

**Inputs.** 40px, white bg, 1px `--border-strong`, 1px radius, mono 14, placeholder `--body-subtle`. Focus: 2px `--brand` outline, offset 2px. Error: `--danger` border + message.

**Empty state.** A Playfair headline, one line of mono copy, and one primary button. No illustrations.

## Accessibility

- WCAG 2.2 AA. Every text/background pair above is at least 4.5:1.
- Visible focus: 2px `--brand` outline on light surfaces, 2px `--lime` on brand surfaces.
- 44×44px minimum touch targets. Semantic HTML first. Never color alone.

## Writing tone

Concise, confident, friendly. Sentence case for everything, e.g. "New report", "Start free trial". Uppercase only for small eyebrow labels ("WORKSPACE OVERVIEW"). Say what happened and what to do next.

## Tailwind v4 theme (paste into `app/globals.css`)

```css
@import "tailwindcss";

@theme {
  --font-serif: var(--font-playfair), Georgia, "Times New Roman", serif;
  --font-mono: var(--font-geist-mono), "JetBrains Mono", ui-monospace, monospace;
  --font-sans: var(--font-geist-mono), ui-monospace, monospace; /* app body is mono */
  --radius-xs: 1px; --radius-sm: 1px; --radius-md: 1px; --radius-lg: 1px;
  --color-brand: #0000f2;
  --color-brand-strong: #0000c2;
  --color-brand-soft: #dde1ff;
  --color-brand-softer: #f1f3ff;
  --color-lime: #edff45;
  --color-heading: var(--heading);
  --color-body: var(--body);
  --color-body-subtle: var(--body-subtle);
  --color-surface: var(--surface);
  --color-surface-card: var(--surface-card);
  --color-surface-muted: var(--surface-muted);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
}

:root {
  --bg: #ffffff; --surface: #ffffff; --surface-card: #f4f6fe; --surface-muted: #edeffa;
  --heading: #0a0a23; --body: #33374a; --body-subtle: #6a6e85;
  --border: #dde1f5; --border-strong: #c4c8e0; --link: #0000f2;
  --success: #15803d; --success-soft: #ecfdf3;
  --warning: #b45309; --warning-soft: #fffaeb;
  --danger: #c81e1e;  --danger-soft: #fff1f2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #07071c; --surface: #0d0d26; --surface-card: #11112e; --surface-muted: #171736;
    --heading: #f4f5fb; --body: #e6e8f5; --body-subtle: #9c9fb8;
    --border: #26264a; --border-strong: #3a3a66; --link: #a5aaff;
    --success: #4ade80; --success-soft: #0f2a1b;
    --warning: #fbbf24; --warning-soft: #2a1f08;
    --danger: #f87171;  --danger-soft: #2a0e12;
  }
}
body { background: var(--bg); color: var(--body); font-family: var(--font-mono); }
```

## Don't

- Round corners past 1px (except avatars/dots), or add gradients.
- Use lime for text on light surfaces or for anything that isn't a highlight.
- Use Playfair inside app UI controls, or mono for marketing hero headlines.
- Stack shadows on cards. Borders do the work.
