# Job Radar Design System

A bold, technical look: **electric ultramarine** brand surfaces, **crisp white** bordered content, **lime** reserved for highlights, **serif** display headings, **monospace** app UI, and exact **1px corners**. It's flat and precise, with no gradients and no soft shadows.

> Original tokens written for this project, inspired by the "Contemporan" direction on typeui.sh (that skill file itself isn't used).

## Principles

1. **Blue frames, white works.** Full-bleed ultramarine for the app header, hero and footer. Everything you read or act on sits on white (light) or ink (dark) surfaces with 1px borders.
2. **Lime means "look here".** It's only for new or urgent signals: the "New" count, a just-posted badge, the active nav item, focus on blue surfaces. Never use it for body text, and never put lime text on white (1.3:1 contrast).
3. **Serif speaks, mono works.** Serif for page titles and big numbers people glance at. Mono for the app itself: labels, buttons, tables, badges, countdowns. Sans for long reading (job descriptions, notes).
4. **Exact, not soft.** Radius is 1px everywhere. Use borders instead of shadows. Show state with color and border changes, not motion.

## Color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--brand` | `#2436FF` | `#2436FF` | Header/hero/footer surfaces, primary buttons |
| `--brand-strong` | `#1E2BE0` | `#1E2BE0` | Primary button hover/pressed |
| `--on-brand` | `#FFFFFF` | `#FFFFFF` | Text/icons on brand (6.9:1) |
| `--link` | `#2436FF` | `#8C96FF` | Links and selected states on page surfaces |
| `--lime` | `#C6F432` | `#C6F432` | Highlights only. Text on lime is always `--ink` (15:1) |
| `--bg` | `#FFFFFF` | `#0B0B14` | Page background |
| `--surface` | `#FFFFFF` | `#12121E` | Cards, tables, panels |
| `--surface-muted` | `#F6F6F9` | `#1A1A28` | Table header, hover rows, inputs |
| `--ink` | `#0B0B14` | `#F4F4F8` | Primary text |
| `--ink-muted` | `#5B5B6B` | `#A3A3B2` | Secondary text, meta (6.7:1 / 7.9:1) |
| `--border` | `#E4E4EA` | `#2A2A3C` | 1px borders and dividers |
| `--border-strong` | `#0B0B14` | `#F4F4F8` | Emphasized borders (selected card, focused input) |
| `--success` | `#067647` | `#4ADE80` | Applied, verified live |
| `--warning` | `#B45309` | `#FBBF24` | Deadline ≤ 14 days |
| `--danger` | `#B42318` | `#F87171` | Deadline ≤ 3 days, closed job, errors |

Rules: brand blue text on dark ink fails contrast (2.8:1), so in dark mode links use `--link` (`#8C96FF`). Status is never shown by color alone. Always pair it with a word or icon ("3 days left", "Closed").

## Typography

Load from Google Fonts: **Instrument Serif** (400, italic), **IBM Plex Mono** (400, 500, 600), **IBM Plex Sans** (400, 500, 600).

| Role | Font | Size / line-height | Weight | Notes |
| --- | --- | --- | --- | --- |
| Display | Instrument Serif | 56/60 (desktop), 40/44 (mobile) | 400 | Hero only ("12 new since your last visit") |
| H1 | Instrument Serif | 40/44 | 400 | Page titles |
| H2 | Instrument Serif | 28/32 | 400 | Section titles |
| Stat | Instrument Serif | 48/48 | 400 | Big numbers: new-job count, days left |
| Label / UI | IBM Plex Mono | 13/16 | 500 | Buttons, nav, badges, table headers. UPPERCASE, +0.04em tracking |
| UI body | IBM Plex Mono | 14/20 | 400 | Card meta, table cells, inputs |
| Reading | IBM Plex Sans | 16/26 | 400 | Descriptions, notes, long text |
| Small | IBM Plex Mono | 12/16 | 400 | Timestamps ("verified 6 min ago") |

Use tabular numbers (`font-variant-numeric: tabular-nums`) anywhere numbers line up: countdowns, counts, dates.

## Space, lines and shape

- **Spacing:** 4px base scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Card padding is 16 (mobile) / 24 (desktop). Section gaps are 48–64.
- **Radius:** `1px` on everything: buttons, inputs, cards, badges, modals.
- **Borders:** 1px `--border`. Selected/active cards get 1px `--border-strong` plus a 4px lime left rule.
- **Shadows:** none. Elevation comes from borders and surface color.
- **Layout:** 12-column grid, max width 1200px, 16px side gutters on mobile. The dashboard uses a bento grid of bordered cells sharing 1px borders (no gaps).
- **Motion:** 120ms ease-out on color/border only. Respect `prefers-reduced-motion` (no motion).

## Components

**App header (brand surface).** Full-bleed `--brand`, wordmark in Instrument Serif on `--on-brand`, nav in mono uppercase. The active nav item gets a lime underline (2px). There's a "Last checked 4 min ago" status on the right in mono small, which turns into a `--danger` pill if polling is stale.

**Buttons.**
- Primary: `--brand` background, `--on-brand` mono uppercase label, 1px radius, 40px tall (44px on touch). Hover `--brand-strong`.
- Secondary: white/`--surface` background, 1px `--border-strong`, `--ink` label.
- Ghost: no border, `--link` label. Used for "Hide" / "Edit".
- On brand surfaces: white background with `--brand` label.

**Job card.** A bordered `--surface` cell. The top row has the company (mono 13, `--ink-muted`) and a posted/verified timestamp. Then the title (Plex Sans 18/24, 600, `--ink`). Then the badges row: role family, level, degree, location tier. Actions at the bottom: Apply (primary), Save, Hide. If grouped, show "+3 locations" in mono. A new job gets a lime "NEW" badge.

**Badges.** Mono 12 uppercase, 1px border, 1px radius, 2px 6px padding. Neutral: `--border` + `--ink-muted`. New: lime background + `--ink`. Status badges use the status color for border + text.

**Deadline row (Grad Programs table).** School + program in Plex Sans. Degree/status in mono. The countdown is right-aligned in mono tabular ("23 DAYS"). At ≤ 14 days the whole row gets a 4px `--warning` left rule and the countdown text in `--warning`. At ≤ 3 days, `--danger`. Past deadlines are shown muted with "Closed".

**Deadline banner.** A strip under the header with the next 3 deadlines as bordered cells: school (mono), program (sans), days left (serif stat).

**Inputs.** 40px tall, `--surface-muted` background, 1px `--border`, 1px radius, mono 14. Focus: 1px `--border-strong` + 2px `--brand` outline offset 2px. Error: `--danger` border + message below.

**Tables.** Header row `--surface-muted`, mono uppercase 12. Rows separated by 1px `--border`, hover `--surface-muted`. Dense by default (40px rows).

**Empty states.** A serif headline plus one line of mono explanation plus one primary action. No illustrations.

## Accessibility

- WCAG 2.2 AA. All token pairs above meet 4.5:1 for text.
- Visible focus everywhere: a 2px `--brand` outline on light surfaces, 2px `--lime` on brand surfaces.
- Touch targets are at least 44×44px.
- Semantic HTML first (`<button>`, `<table>`, `<nav>`), ARIA only when needed.
- Never rely on color alone for deadlines, status or tiers.

## Writing tone

Short, direct, helpful. Use labels in mono uppercase ("APPLY", "SAVE", "3 DAYS LEFT"). Use sentence case for everything else. Say what happened and what to do: "This job just closed. It was removed from your feed."

## Tailwind v4 theme (paste into `app/globals.css`)

```css
@import "tailwindcss";

@theme {
  --font-serif: "Instrument Serif", ui-serif, Georgia, serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --radius-DEFAULT: 1px;
  --color-brand: #2436ff;
  --color-brand-strong: #1e2be0;
  --color-lime: #c6f432;
}

:root {
  --bg: #ffffff; --surface: #ffffff; --surface-muted: #f6f6f9;
  --ink: #0b0b14; --ink-muted: #5b5b6b; --border: #e4e4ea; --border-strong: #0b0b14;
  --link: #2436ff; --success: #067647; --warning: #b45309; --danger: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0b14; --surface: #12121e; --surface-muted: #1a1a28;
    --ink: #f4f4f8; --ink-muted: #a3a3b2; --border: #2a2a3c; --border-strong: #f4f4f8;
    --link: #8c96ff; --success: #4ade80; --warning: #fbbf24; --danger: #f87171;
  }
}
```

## Don't

- Use gradients, drop shadows, or radius above 1px.
- Use lime for text on light surfaces or for anything that isn't a highlight.
- Mix fonts inside one element (e.g., a serif button label).
- Put long reading text in mono.
