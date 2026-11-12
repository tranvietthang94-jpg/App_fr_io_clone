# UI redesign — "Filmic workspace" (direction A) — design

Date: 2026-11-12 · Status: draft for review

## Intent

The owner wants the whole signed-in app to look more polished and coherent, in the style of a
professional post-production tool (reference: Frame.io V4), while keeping the current sign-in
screens exactly as they are — the owner likes them. The sign-in screen's look (near-black, cinematic,
coral/orange-red primary button, small green brand dot) is the anchor the rest of the app should match.

Success: every signed-in screen uses one consistent visual language (direction A, mockup
`.superpowers/brainstorm/1106-1794457607/content/ui-directions.html`), the coral primary is used for
every primary action, the app shell gives more room to video, and nothing functional changes
(all existing e2e tests still pass).

## Goals

- **Primary colour = the sign-in button's coral/orange-red**, used for every primary action
  (Upload, Save, Confirm, active nav item, focus ring, timeline comment markers, timecodes).
- **Green only for "approved"/success state and the brand dot** in the "R.Frame" wordmark.
- **Destructive actions use a distinctly deeper red** so they can't be confused with primary.
- **New app shell** for all signed-in pages:
  - a narrow **icon rail** on the left (Dự án, Thông báo, Quản trị [only if admin], Cài đặt; user
    avatar + sign-out at the bottom; storage bar reachable from it),
  - a **collapsible secondary panel** next to it: project list + folders of the open project
    (on pages that have a project context), collapse state remembered per browser,
  - **mobile (< lg):** rail becomes a bottom tab bar; the secondary panel becomes a slide-in drawer.
- **Restyle every signed-in screen** to direction A: projects list, project page (grid, folders,
  trash, activity, members, settings), video review page, admin page, profile settings,
  notifications, upload queue, dialogs/menus/toasts — and the **guest review page**
  `/review/[token]` (same player/comments UI, so it must match).
- Denser, more "filmic" content: larger thumbnails with duration/version/review-status chips,
  metadata line under each card, comment timecodes in the primary colour on the timeline and list.
- **Keep:** dark-only, Inter + JetBrains Mono, existing spacing scale, all routes, all behaviour.

## Non-goals

- Sign-in group (`app/(auth)/*`: login, register, forgot/reset password) — **visually unchanged**.
- Light mode / theme toggle (dark-only stays, per `design-system/MASTER.md`).
- New features, API or data changes; reorganising routes.
- Replacing the in-house `components/ui/*` with shadcn/ui or any new UI library (approach 2 was rejected).
- A `/v2` parallel UI (approach 3 was rejected).

## Anti-goals

- Any visible change to the sign-in screens.
- Breaking any existing behaviour or e2e test; hiding a control a user could reach before
  (moving it is fine, removing it is not).
- Losing keyboard access, focus visibility or screen-reader labels that exist today; contrast below WCAG AA.
- Horizontal scroll or off-screen buttons at 375 px width (regressions of the fixes recorded in
  `design-system/pages/video-review.md`).

## Constraints

- `apps/web`: Next.js 14, React 18, Tailwind (tokens in `tailwind.config.ts`), in-house components in
  `components/ui/*` (Button, Card, Input, Dialog, AlertDialog, DropdownMenu, Tabs, Toast, Tooltip,
  Avatar, Skeleton), lucide icons. Project rule: no new dependencies if avoidable, smallest diff.
- The sign-in pages share tokens and components with the rest of the app (`bg-bg-primary`,
  `Button variant="danger"` for the login button, `text-accent-green` links). **Any token change
  must leave the sign-in pages pixel-identical** — see "Protecting the sign-in screens".
- Tokens today are inconsistent: `accent.blue` is actually green `#10B981`, `primary` is green,
  the login CTA uses `danger`. ~118 usages of green/primary classes across `app/` and `components/`,
  25 files use `accent-red`.
- `design-system/MASTER.md` and `design-system/pages/video-review.md` are the written design system;
  they must be updated to reflect this redesign (they currently say blue/green primary).
- An existing `components/workspace/WorkspaceRail.tsx` (used only on the video page) — reuse or
  fold into the new rail; don't keep two rails.
- 64 Playwright e2e tests are the safety net; many select elements by text/role — restyling must
  keep accessible names and visible labels.

## Approaches considered

1. **Token-first, in place (chosen).** Retune Tailwind tokens → restyle the 11 `ui/*` components →
   build the new app shell → restyle each page. No new deps, every step shippable and covered by e2e
   + before/after screenshots. Cost: mid-way, some pages look new and some old (all still work).
2. **Move to shadcn/ui + Radix.** Modern accessible primitives, but many new deps and a rewrite of
   every component and call site — large risky diff for components that work today. Rejected.
3. **Parallel `/v2` UI behind a flag.** Users never see a half-done UI, but every page exists twice
   for a long time. Not worth it for an internal tool. Rejected.

Chosen by the owner: **1**.

## Decided design

### Colour tokens (exact values to be confirmed against the live login button — see Left to builder)

| Token | Value | Use |
|---|---|---|
| `primary` / `primary.hover` / `primary.active` | the login button's current colour (`accent.red` `#EF4444` today) and its current hover | every primary action, active nav, focus ring, timeline markers, timecodes |
| `primary.soft` | primary at ~12–16 % alpha | selected rows/items, subtle highlights |
| `destructive` | outlined style, see "Calls made by the designer" #1 | delete / permanent delete / revoke |
| `success` | `#22C55E` (MASTER.md) | approved status, success toasts |
| `warning` | `#F59E0B` | needs-review, near-quota |
| `brand.dot` | `#10B981` (current green) | the "." in R.Frame only |
| `bg.*`, `text.*`, `border.*` | keep current values unless contrast requires a tweak | surfaces |

Clean up the misleading `accent.blue` (= green) by migrating its usages to the right semantic token.

### Protecting the sign-in screens

- Before any change, capture **baseline screenshots** of `/login`, `/register`, `/forgot-password`,
  `/reset-password/<token>` at 1440×900 and 375×812, committed under `apps/web/tests/e2e/__screenshots__/`
  (Playwright `toHaveScreenshot`, small tolerance for font antialiasing).
- The login submit button switches from `variant="danger"` to `variant="primary"`; since primary
  becomes the same colour, it must render identically. Green links on auth pages keep green
  (`brand`/success token or explicit class) so the auth pages don't change.
- The visual-regression spec runs in every task; any diff on auth pages fails the task.

### App shell

- `app/(dashboard)/layout.tsx` is rebuilt around two new components:
  - `components/shell/IconRail.tsx` — 56 px rail, icons with tooltips and `aria-label`s, active item
    in primary; bottom: notifications bell, avatar menu (profile, sign out), storage usage
    (compact ring or bar with tooltip; full `StorageBar` inside the avatar menu or panel).
  - `components/shell/ContextPanel.tsx` — ~240 px, collapsible (button + `[` shortcut), shows
    project list (search) and, inside a project, its folder tree; remembers collapsed state in
    `localStorage` (guarded with try/catch).
- The video review page keeps its full-width workspace: rail stays, context panel auto-collapsed.
  `WorkspaceRail.tsx` is folded into the new rail/panel.
- Mobile (< lg): bottom tab bar (same items as the rail), context panel as a drawer opened from
  a header button.

### Components (`components/ui/*`)

Restyle all 11 to direction A: tighter radii (6–8 px), 1 px borders on surfaces, softer shadows
for floating layers (menus, dialogs, toasts), consistent heights (32/36/40 px), visible focus ring
in primary. Add variants only where pages need them (e.g. `Button` `destructive`, `Badge`/status chip
if a shared one doesn't exist — check `ReviewStatusControl` first).

### Pages

Each page restyled to match the mockup's direction A screens:
- **Projects list** and **project page**: header with title + counts + primary Upload; 4-column
  thumbnail grid at desktop (responsive down to 1–2 columns), card = 16:9 thumbnail with duration
  and version overlay + status chip + one metadata line; folders in the context panel; trash /
  activity / members / settings as tabs.
- **Video review** (and guest `/review/[token]`): player area maximal; timeline with primary-coloured
  comment markers; right panel (comments/export tabs, as today) restyled with timecode chips;
  keep all fixes listed in `design-system/pages/video-review.md`.
- **Admin**, **profile settings**, **notifications**, **upload queue**, **share-link / export /
  copy-move / permanent-delete dialogs**: restyle with the new components; no layout redesign
  beyond what the shell implies.

### Design system docs

Update `design-system/MASTER.md` (primary = coral, semantic table, shell description) and
`design-system/pages/video-review.md` (new shell; guest page now aligned).

### Verification (every task)

- Root `npm run lint`, full Playwright suite green, auth visual-regression unchanged.
- Before/after screenshots of the touched pages at 1440×900 and 375×812 attached to the task report.
- Spot-check contrast of text on new surfaces (WCAG AA) and keyboard navigation of the shell.

## Left to the builder

- Exact hover/active shades for primary and destructive (derive from the live login button's
  computed colours; keep login identical).
- Rail icon set (lucide), tooltip implementation (existing `ui/Tooltip`), storage indicator form.
- Task ordering after the token + component + shell steps.

## Calls made by the designer after the builder check (owner to check)

1. **Primary = exactly the login button's colour, `#EF4444`** (what the owner sees as "đỏ cam" on the
   sign-in screen; the mockup's `#F0533B` was only an approximation). This keeps the sign-in screens
   pixel-identical. Because primary and today's danger are then the same hue, **destructive actions are
   distinguished by form, not only by shade**: destructive buttons are outlined (transparent fill,
   `#F87171` text, `#7F1D1D` border; solid `#B91C1C` only inside the final confirm step of a destructive
   dialog), always paired with a trash/alert icon, and all destructive actions keep their existing
   confirmation dialogs. Primary buttons are solid `#EF4444`.
2. **Folders stay as cards in the grid** (with their menus and drag-and-drop targets, unchanged in
   behaviour). The context panel is **extra navigation only**: project list, and inside a project its
   top-level folders as links. To make those links work, the open folder moves into the URL
   (`?folder=<id>`) on the project page, replacing the in-page `folderPath` state as the source of truth
   (breadcrumb still shown). No full folder tree is built.
3. **"Tabs" on the project page are tab-styled links over the existing routes/controls**: Video (grid),
   Thùng rác (existing toggle), Hoạt động + Cài đặt (link to the existing `/projects/[id]/settings`),
   Thành viên (opens the existing dialog). No routes are merged or moved.
4. **Guest page `/review/[token]`** gets the restyled player/comments but **no rail/panel** (guests are
   not signed in). **"Thông báo"** in the rail opens the existing bell dropdown (there is no page).
5. **Sign-in pages are pinned**: where they use shared components (`Input`, `Button lg`, green links),
   they get explicit classes reproducing today's look, so restyling shared components can't change
   them; the screenshot baseline enforces it.

## Open questions (for the owner)

- None outstanding — see the calls above.
