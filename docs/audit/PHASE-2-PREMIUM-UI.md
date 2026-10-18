# Ops Dashboard — Phase 2: Premium UI & UX

**Status:** PLAN ONLY. Nothing changed, nothing committed. **Do not start until Phase 1 is signed off** ([PHASE-1-FIX-FUNCTIONALITY.md](./PHASE-1-FIX-FUNCTIONALITY.md)) — Phase 1 creates the shared primitives (`StatusBadge`, `Pagination`, `useTableQuery`, `format`) that this phase restyles once instead of 20 times.
**Branch:** `feature/institution-mode` only. `main` untouched.
**Date:** 2026-10-18

---

## 1. Where the UI stands today (measured, not guessed)

Counted across `app/` and `components/` (static scan, 333 TS/TSX files):

| Signal | Measured | Why it matters |
|---|---|---|
| Distinct `<h1>` class strings | **10** variants (`text-xl`, `text-2xl`, `text-3xl`, `text-4xl sm:text-5xl`; `font-bold` vs `font-black`) | No consistent page header; pages feel like different products. |
| Micro text `text-[9px]/[10px]/[11px]` | **471** uses | Below comfortable reading size on dense admin tables; hurts scanning and accessibility. |
| Hand-rolled modals (`fixed inset-0`) | **36**, only **1** `aria-modal`/`role="dialog"` | No focus trap, no Esc/scroll-lock consistency, screen readers see nothing. |
| `<button>` vs `aria-label` | 225 buttons, **4** labels (many icon-only) | Icon buttons are unlabeled. |
| `<table>` | 22, **0** `scope="col"` | Tables lack semantics; no sticky headers, no density control. |
| Native `<select>` | 41 | Inconsistent look; the good `OrganizationCombobox`/`SearchSelect` exist but are used rarely. |
| Light-only pastel badges (`bg-emerald-50 text-emerald-700`…) | **38** | Look washed-out or illegible in dark mode, which the app supports. |
| Raw hex colours in TSX | 20 | Bypass the token system (`globals.css` has good oklch tokens). |
| `prefers-reduced-motion` handling | **0** | Page-change, sidebar, and toast animations always run. |
| Loading states | 41 `animate-pulse` skeletons, hand-built each time | Inconsistent shapes; no shared skeleton. |
| Empty / error states | Hand-written per page; several pages have **no** error state (e.g. Organizations shows "No Organizations Found" on a failed request — Phase 1 ORG-1) | Users can't tell "nothing here" from "broken". |
| Navigation | Sidebar items are `<button onClick={router.push}>`, not links | No prefetch, no middle-click / open-in-new-tab, no right-click copy link. |
| App shell | `return null` until mounted + auth settled | Blank white flash on every hard refresh; no shell skeleton. |
| Route transition | `AnimatePresence mode="wait"` keyed on pathname, exit + enter 180 ms each | Every navigation is delayed by the exit animation and remounts the whole page. |
| Font loading | `@import url(fonts.googleapis.com…)` at the top of `globals.css` | Render-blocking; flash of fallback; use `next/font`. |
| Content width | `max-w-4xl` (Flags), `max-w-7xl` (Metrics), unbounded elsewhere | Uneven gutters between pages. |
| Pagination footers | 11 hand-rolled | Phase 1 C3 collapses to one. |

**What's already good (keep):** oklch token set with light/dark, warm off-white + teal/amber palette, Geist/Geist Mono, `PaymentDetailsView` (best filter bar and table in the app), `LazyCharts`, toast system, command palette concept, `DateRangePicker`.

---

## 2. Design direction (needs your call — see §8)

My recommendation is **evolve, don't rebrand**: keep the teal + warm-neutral identity, tighten it into a real system.

- **Tone:** calm, dense-but-readable operations console. Information first, ornament second. No gradients-for-decoration, no glassmorphism stacking (the sidebar/header `backdrop-blur` can stay but only once).
- **Type scale (rem-based, min 12 px for data, 11 px only for uppercase micro-labels):** Display 28/36 (page title), Title 20/28, Section 16/24, Body 14/20, Data 13/20 (tabular-nums), Caption 12/16. One `PageHeader` replaces the 10 h1 variants.
- **Colour:** semantic tokens added to `globals.css`: `--status-success/warning/danger/info/neutral` each with `-bg`, `-fg`, `-border` in light **and** dark (replaces the 38 pastel classes and 20 hex). Chart palette stays `--chart-1…5`.
- **Spacing/radius/elevation:** 4-px base scale; two radii (control 8 px, surface 12 px); three elevations (flat, raised, overlay). Today there are ad-hoc `rounded-md/lg/xl`, `shadow-sm/lg/2xl` mixes.
- **Density:** global compact/comfortable toggle for tables (ops users live in tables).
- **Motion:** 120–200 ms, `ease-out`, transform/opacity only; honour `prefers-reduced-motion`; no exit animation on route change; layout-id pill in the sidebar can stay.

---

## 3. Component system (what to build, in dependency order)

Build with what's already installed (React 19, Tailwind 4, `motion`, `lucide-react`, `react-hook-form`, `react-day-picker`). **No new UI library by default.** For overlays use native `<dialog>` (focus trap + Esc + `::backdrop` for free) and the Popover API; this keeps bundle small and fixes the 36-modal accessibility gap. (If you'd rather adopt Radix primitives for Select/Popover/Tooltip, that is one added dependency — decision D2 below.)

| Layer | Components | Replaces |
|---|---|---|
| Tokens | typography classes, status tokens, radii, elevation, focus ring, density vars | ad-hoc utility soup |
| Primitives | `Button` (variants, loading, icon-only requires label), `IconButton`, `Input`, `Select` (styled native → combobox variant), `Checkbox`, `Switch`, `Badge/StatusBadge`, `Tooltip`, `Kbd`, `Skeleton`, `Spinner` | 41 selects, 6 badge systems, hand-built switches |
| Overlays | `Dialog` (native), `Drawer` (side sheet for record detail), `ConfirmDialog` (typed-confirm for destructive), `Popover`, `Toast` (keep, add reduced-motion/aria-live) | 36 modals |
| Data | `DataTable` (sticky header, column align, tabular-nums, sortable header with `aria-sort`, row selection, density, row actions menu, empty/error/loading slots), `Pagination`, `FilterBar` (search + chips + date range + clear-all), `StatCard`, `Sparkline/Chart wrappers` | 22 tables, 11 footers |
| Page | `PageHeader` (title, description, actions, breadcrumb, tabs), `Tabs` (links, URL-synced), `EmptyState`, `ErrorState` (with retry + request id), `Section` | 10 h1 styles, per-page empties |
| Shell | `Sidebar` (real `<Link>`s, collapsible, section labels, active pill), `Topbar` (breadcrumb, ⌘K, theme, role), mobile nav sheet | `layout.tsx` 560 lines |

---

## 4. Page-by-page upgrade plan

Only after Phase 1 fixes are in for that page. "Institution" = surfaces the new institutional-mode data from Phase 1 §3.

| Page | Premium upgrades |
|---|---|
| **App shell** | Links instead of buttons; shell skeleton instead of `null`; breadcrumb in topbar; no route exit-animation; persisted sidebar state; maintenance banner as a slim, dismiss-safe system bar; skip-to-content link. |
| **⌘K palette** | Groups (Pages · Organizations · Actions); fuzzy match; recent items; keyboard hints; "Go to Feature Flags", "Suspend…" style actions; org rows show plan + status chips. |
| **Overview** | KPI row with delta vs previous period and sparkline; "Needs attention" strip (failed payouts, stuck jobs, suspended orgs, flags drifted); upcoming + **live now** contests with Window/Scheduled chips; institution adoption card (orgs with each feature, learners, groups); real empty/error states. |
| **Organizations** | `DataTable` with saved filters, column chooser, server sort, sticky header; Features chips (Portal · Institution · Gradebook · Windows · Pools); plan + status via `StatusBadge`; row drawer preview (owner, usage vs limits, last activity) before full dossier; bulk bar with result summary. |
| **Organization detail** | Header with state banner (suspended reason inline), URL-synced tabs, usage-vs-limit meters, **Institution** panel (learners/groups/contests-by-mode/gradebook) and **Features** matrix (effective state + reason + grant/revoke + dependency warnings), participants as server-paged `DataTable`, activity timeline (audit + flag changes + payments merged). |
| **Feature Flags** | Group by lifecycle (Safety switches · Platform integrations · Institution rollout); access-model badge; rollout bar "N of M orgs granted"; dependency graph chips; kill-switch confirm with blast-radius ("affects 3 organizations, 1 live contest"); drift indicator + "verify sync". |
| **Audit Log** | Unified filter bar (domain → action cascading, actor, target, date range), human-readable diff view for `metadata` (before→after), copy-request-id, one-click "see chain", saved views; consistent time (relative + absolute tooltip). |
| **Billing / Payments / Payouts** | Revenue chart with range presets; consistent money formatting; one ledger with side drawer for payment detail (Razorpay ids with copy), reconciliation badges; payouts as a first-class section. |
| **Messaging** | Compose in a `Drawer` with live preview; status timeline per message; bulk retry with progress; failure reason chips. |
| **Bookings / Calculator** | Pipeline (Kanban-like status columns) as an alternative to the log; calculator as a split view (inputs left, live quote right) with shareable quote. |
| **Plans** | Comparison matrix view; limit meters; impact modal as a diff list. |
| **Colleges / Ambassador types** | Keep functionality; adopt `DataTable`, `Drawer`, consistent field builder styles. |
| **Ops Metrics** | Live tiles with threshold colouring, per-contest drill-down, **Window contest** view (not started / in attempt / auto-submitted), pause-on-hidden-tab polling. |
| **Login** | Clean single-card flow with OTP segmented input, resend cooldown, lockout messaging (pairs with Phase 1 SEC-1). |

---

## 5. Accessibility & quality bar (applies to every page)

- WCAG 2.2 AA contrast for all status colours in light **and** dark; focus-visible ring on every interactive element; hit targets ≥ 32 px (desktop) / 44 px (mobile).
- Every icon-only control has an accessible name; every table has `<caption>`/`aria-label` and `scope="col"`; every dialog is a real dialog with focus return.
- Keyboard: ⌘K, `/` to focus search, `Esc` closes, arrow-key row navigation in tables (stretch).
- `prefers-reduced-motion` honoured globally (one CSS rule + `motion` `reducedMotion="user"`).
- Responsive: usable at 390 px (tables degrade to stacked cards for the 4 most-used lists), 768 px, 1280 px, 1920 px.
- Performance: `next/font` for Geist (remove CSS `@import`), keep charts lazy, no layout shift on tables (fixed row heights while loading), image components for logos with width/height.
- Dark mode QA pass per page (screenshot matrix light/dark × 3 widths).

---

## 6. Execution plan (after Phase 1)

| Step | Scope | Output |
|---|---|---|
| **P2-A Tokens & type** | semantic status tokens, type scale, radii/elevation, focus ring, reduced-motion, `next/font` | `globals.css` + `theme.md` |
| **P2-B Primitives** | Button, Input, Select, Switch, Badge, Skeleton, Tooltip, Dialog/Drawer/ConfirmDialog | `components/ui/*` + a throw-away `/dashboard/_kit` preview page (removed at the end) |
| **P2-C Data components** | DataTable, Pagination, FilterBar, StatCard, PageHeader, Tabs, Empty/Error states | `components/ui/*` |
| **P2-D Shell** | Sidebar/Topbar rewrite, palette v2, breadcrumbs, skeleton | `app/dashboard/layout.tsx` split into small components |
| **P2-E Pages, in this order** | Organizations → Org detail → Feature Flags → Overview → Audit Log → Payments/Billing → Messaging → Bookings/Calculator → Plans → Colleges/Ambassador → Metrics → Login | one reviewable chunk per page |
| **P2-F QA** | a11y audit (axe via browser pane), light/dark × width screenshots, Lighthouse, remove `_kit` page | report |

Each step ends with screenshots in the in-app browser for your review before the next begins. No commits unless you ask.

---

## 7. Out of scope for Phase 2

Functionality fixes (Phase 1), new product features, the main app's UI, billing/subscription redesign for institution mode (explicitly not this sprint), repo-wide `any` removal beyond files touched.

---

## 8. Decisions needed from you

- **D1 — Direction:** evolve the current teal/warm-neutral identity (recommended) or a fresh look?
- **D2 — Dependencies:** build overlays on native `<dialog>`/Popover (zero deps, recommended) or add Radix primitives (a11y battle-tested, +1 dependency family)?
- **D3 — Density default:** compact (more rows per screen) or comfortable?
- **D4 — Mobile priority:** is the ops console used on phones/tablets in practice, or desktop-only with graceful degradation?
- **D5 — Charts:** keep Recharts (already installed) with a unified theme, yes?
- **D6 — Timing:** Phase 2 landing before or after the early-Nov live contest? (Recommendation: after; Phase 1 only before, and nothing from either phase reaches `main` without your go-ahead.)
