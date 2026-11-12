# Filmic Workspace UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every signed-in screen of R.Frame to direction A ("filmic workspace") with the login button's red as the primary colour, a new icon-rail + context-panel shell, and the sign-in screens pixel-identical.

**Architecture:** Token-first, in place. Pin the sign-in screens with a screenshot baseline and explicit classes, retune Tailwind tokens and migrate colour classes, restyle the 11 `components/ui/*`, build the new shell, then restyle page groups. Each task is shippable and verified by the full Playwright suite plus the sign-in visual baseline.

**Tech Stack:** Next.js 14, React 18, Tailwind, lucide-react, Playwright (`toHaveScreenshot`).

**Spec:** `docs/superpowers/specs/2026-11-12-ui-filmic-workspace-design.md` — read it first, especially "Calls made by the designer", which override earlier sections. Mockup (direction A): `.superpowers/brainstorm/1106-1794457607/content/ui-directions.html`.

## Global Constraints

- Sign-in group `app/(auth)/*` + `app/(auth)/layout.tsx` must stay **pixel-identical** (enforced by `auth-visual.spec.ts`, Task 1).
- Colours (exact): `primary #EF4444`, `primary.hover #DC2626`, `primary.active #B91C1C`, `primary.soft rgba(239,68,68,0.14)`; `success #22C55E`; `warning #F59E0B`; `brand #10B981` (only the "." in R.Frame and the auth pages' green links); destructive = outlined: text `#F87171`, border `#7F1D1D`, hover bg `rgba(127,29,29,0.25)`; destructive solid `#B91C1C` (hover `#991B1B`) only for the final confirm button of a destructive dialog. `bg.*`, `text.*`, `border.*` keep current values unless AA contrast fails.
- Dark-only. Fonts Inter / JetBrains Mono. Existing spacing scale and radii scale stay; components use 6–8 px radii.
- No new npm dependencies. No API/data/behaviour changes. No route changes except the project page's `?folder=<id>` query param (Task 5).
- Never remove a control users can reach today; moving it is fine. Keep accessible names/labels that e2e tests select by.
- Shell sizes: rail 56 px wide; context panel 240 px; breakpoint `lg` (1024 px) — below it: bottom tab bar + drawer.
- Every task: root `npm run lint`, full Playwright suite green (needs the e2e window — ask the coordinator), `auth-visual.spec.ts` green, before/after screenshots of touched pages at 1440×900 and 375×812 saved under `.devenv/shots/<task>/` (gitignored) and listed in the report.
- `localStorage` access always wrapped in try/catch; UI works when it throws.

## Review Focus

1. **Long names** (Vietnamese diacritics, 80+ chars) for projects/files/folders in the panel, cards, breadcrumbs and review header — must truncate with ellipsis + full name in `title`, no overflow at 375 px. Test in Task 5 (`long names truncate`).
2. **Reload / back / forward inside a folder** — `?folder=<id>` restores the same folder; an unknown or other-project folder id falls back to the root without an error toast loop. Test in Task 5.
3. **Many projects (60+)** in the context panel — panel scrolls independently, search filters, active project stays visible. Test in Task 4.
4. **Keyboard-only use** — rail, panel toggle, bottom bar and drawer reachable by Tab with a visible primary focus ring; `[` toggles the panel but not while typing in an input/textarea/contentEditable. Test in Task 4.
5. **`localStorage` throwing** (private mode) — shell renders with the panel expanded, toggling still works for the session. Test in Task 4.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/web/tests/e2e/auth-visual.spec.ts` + `__screenshots__/` | sign-in pixel baseline |
| `apps/web/tailwind.config.ts` | tokens |
| `apps/web/components/ui/*.tsx` | restyled primitives; `Button` variants `primary | secondary | ghost | destructive | destructiveSolid` |
| `apps/web/components/ui/StatusChip.tsx` | review-status / generic chip (only if no shared chip exists — check `ReviewStatusControl.tsx` first) |
| `apps/web/components/shell/IconRail.tsx` | desktop rail |
| `apps/web/components/shell/ContextPanel.tsx` | collapsible projects/folders panel |
| `apps/web/components/shell/MobileNav.tsx` | bottom tab bar + drawer (< lg) |
| `apps/web/lib/shellState.ts` | `usePanelCollapsed()` with guarded localStorage |
| `apps/web/app/(dashboard)/layout.tsx` | composes the shell |
| `design-system/MASTER.md`, `design-system/pages/video-review.md` | updated docs |

---

### Task 1: Pin the sign-in screens

**Files:**
- Create: `apps/web/tests/e2e/auth-visual.spec.ts`, `apps/web/tests/e2e/__screenshots__/…` (generated)
- Modify: `apps/web/app/(auth)/login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/[token]/page.tsx`, `app/(auth)/layout.tsx` (explicit classes only)

**Interfaces:** Produces the baseline every later task must keep green.

- [ ] **Step 1:** Write `auth-visual.spec.ts`: for `/login`, `/register`, `/forgot-password`, `/reset-password/visual-test-token`, at viewports 1440×900 and 375×812, `await expect(page).toHaveScreenshot(\`${name}-${w}.png\`, { fullPage: true, maxDiffPixelRatio: 0.002, animations: 'disabled' })`; wait for `document.fonts.ready` and for the background image to load first. Also assert the login submit button's computed `background-color` is `rgb(239, 68, 68)`.
- [ ] **Step 2:** Run with `--update-snapshots` on the **unchanged** code to create the baseline, then run twice without it → PASS both times (stable).
- [ ] **Step 3:** Pin: on the auth pages replace reliance on shared colour semantics with explicit classes that reproduce today's computed styles (login/register submit buttons: explicit `bg-[#EF4444] hover:bg-red-500 text-white`; green links: explicit `text-[#10B981]`; inputs: pass a `className` reproducing today's height/border/focus ring). Run the spec → PASS (pixel-identical).
- [ ] **Step 4:** Full Playwright suite + lint PASS.
- [ ] **Step 5: Commit** `test(web): pin sign-in screens with a visual baseline`

### Task 2: Tokens and colour migration

**Files:**
- Modify: `apps/web/tailwind.config.ts`; every file under `apps/web/app/**` and `apps/web/components/**` using `accent-blue`, `accent-green`, `primary` colour classes, `accent-red`.

**Interfaces:**
- Produces Tailwind colours: `primary.{DEFAULT,hover,active,soft}`, `success`, `warning`, `brand`, `destructive.{text,border,hoverbg,solid,solidhover}` (values per Global Constraints). Remove `accent.blue`. Keep `accent.{green,red,yellow,purple}` only if something still needs them after migration; otherwise remove.
- Mapping rule for migration: green used for an **action / active / focus / link** → `primary`; green for **approved / success / done** → `success`; the wordmark dot → `brand`; red for **delete/revoke/error** → `destructive.*` (error banners: destructive text on `destructive.hoverbg`); purple (mentions) unchanged.

- [ ] **Step 1:** Add a Playwright spec `tokens.spec.ts` (failing): on `/projects` the "Tạo dự án"/primary button's computed bg is `rgb(239, 68, 68)`; an approved status chip on a video card is `rgb(34, 197, 94)`; the wordmark dot is `rgb(16, 185, 129)`.
- [ ] **Step 2:** FAIL. **Step 3:** change tokens, migrate every usage by the mapping rule (grep `accent-blue|accent-green|accent-red|bg-primary|text-primary(?!-)` must end with only intentional hits; list them in the report).
- [ ] **Step 4:** `tokens.spec.ts`, `auth-visual.spec.ts`, full suite, lint PASS; screenshots of projects, project, review, admin pages.
- [ ] **Step 5: Commit** `refactor(web): primary red tokens and semantic colour migration`

### Task 3: Restyle `components/ui/*`

**Files:** Modify all 11 in `apps/web/components/ui/`; call sites of `variant="danger"` (11) → `destructive` or `destructiveSolid` (final confirm button of AlertDialog / ConfirmPermanentDelete). Create `StatusChip.tsx` only if needed.

**Interfaces:**
- `Button` variants: `primary` (solid primary), `secondary` (bg-tertiary, 1 px border), `ghost`, `destructive` (outlined per Global Constraints, requires an icon prop or child icon), `destructiveSolid`. Sizes: `sm` 32 px, `md` 36 px, `lg` 40 px. Remove `danger`.
- Surfaces (`Card`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Toast`, `Tooltip`): 1 px `border` token, radius 8 px (cards/dialogs) / 6 px (menus, inputs, buttons), shadows: menus/toasts `0 8px 24px rgba(0,0,0,.45)`, dialogs `0 16px 48px rgba(0,0,0,.55)`.
- Focus: `focus-visible:ring-2 ring-primary ring-offset-2 ring-offset-bg-primary` everywhere.
- `Input`: 36 px default height, focus ring primary (auth pages unaffected — pinned in Task 1).
- `StatusChip({ status: 'approved'|'needs_review'|'in_review'|'rejected' | 'neutral', children })` — success / warning / text-secondary / destructive.text.

- [ ] **Step 1:** Extend `tokens.spec.ts` (failing): a destructive button (e.g. "Xoá vĩnh viễn" menu → dialog step 1 "Tiếp tục") has transparent bg and border `rgb(127, 29, 29)`; the final confirm in `ConfirmPermanentDelete` is `rgb(185, 28, 28)`; focused primary button shows a 2 px ring in primary.
- [ ] **Step 2–4:** FAIL → implement → specs + full suite + lint PASS; screenshots of dialogs, menus, toasts.
- [ ] **Step 5: Commit** `feat(web): restyle UI primitives for the filmic workspace`

### Task 4: New app shell

**Files:**
- Create: `components/shell/IconRail.tsx`, `ContextPanel.tsx`, `MobileNav.tsx`, `lib/shellState.ts`; `tests/e2e/shell.spec.ts`
- Modify: `app/(dashboard)/layout.tsx`; video review page (remove `WorkspaceRail` usage); Delete: `components/workspace/WorkspaceRail.tsx` after folding its items in.

**Interfaces:**
- `IconRail({ active: 'projects'|'admin'|'settings' })` — items: Dự án (`/projects`), Thông báo (opens existing `NotificationBell` dropdown), Quản trị (`/admin`, only if `isSuperAdmin || adminPermissions.length`), Cài đặt (`/settings/profile`); bottom: avatar menu (Hồ sơ, Đăng xuất) and a compact storage indicator whose tooltip shows `StorageBar` text; full `StorageBar` inside the avatar menu. Every item: `aria-label`, `ui/Tooltip`, active = primary.
- `ContextPanel({ projectId?: string; activeFolderId?: string | null })` — header with search input; list of the user's projects (`projectsApi` existing call, active highlighted); when `projectId` is set, its **top-level** folders as links to `/projects/<id>?folder=<folderId>` (consumed by Task 5); collapse button + `[` shortcut (ignored in input/textarea/contentEditable).
- `usePanelCollapsed(): [boolean, (v: boolean) => void]` — key `rframe.panelCollapsed`, default `false`, try/catch around storage; on the video review route default collapsed.
- `MobileNav` (< lg): fixed bottom bar with the rail items; header button opens `ContextPanel` as a drawer (focus-trapped, Esc closes, overlay click closes).
- Layout keeps every existing destination reachable (projects, settings/profile, admin, notifications, storage, logout).

- [ ] **Step 1: Failing `shell.spec.ts`:** `rail shows admin item only for admins`; `panel collapses with button and [ key, stays collapsed after reload`; `[ typed in the search box does not collapse`; `60 projects: panel scrolls and search filters to 1` (create via API in beforeAll); `localStorage throwing still renders and toggles` (`page.addInitScript` overriding `Storage.prototype.getItem/setItem` to throw); `375px: bottom bar visible, drawer opens/closes with Esc, no horizontal scroll`; `keyboard: Tab reaches every rail item with visible focus ring`.
- [ ] **Step 2–4:** FAIL → implement → shell spec + full suite (update selectors in existing specs only where the old sidebar was clicked, keeping intent) + auth-visual + lint PASS; screenshots desktop/mobile, panel open/collapsed.
- [ ] **Step 5: Commit** `feat(web): icon rail and context panel app shell`

### Task 5: Projects list and project page

**Files:** Modify `app/(dashboard)/projects/page.tsx`, `app/(dashboard)/projects/[projectId]/page.tsx`, `components/dashboard/VideoCard.tsx`, folder card markup in the project page, `components/project/*` as touched; Test `tests/e2e/project-page.spec.ts`.

**Interfaces:**
- Project page reads/writes the open folder via `?folder=<id>` (`useSearchParams` + `router.push`); breadcrumb derives from the folder chain (load parents as needed via existing folder API — if the API can't return parents, keep a client cache and fall back to root + single crumb). Unknown/foreign id → `router.replace` to root, one toast at most.
- Header: title + counts ("12 video") + primary "Upload"; tab-styled links: Video | Thùng rác (existing toggle) | Hoạt động & Cài đặt (link `/projects/<id>/settings`) | Thành viên (existing dialog).
- Grid: 4 columns ≥ 1280, 3 ≥ 1024, 2 ≥ 640, 1 below. Card: 16:9 thumbnail, overlay duration bottom-right and `v<N>` top-left, `StatusChip` for review status, one metadata line (upload date · `formatBytes(fileSize)` — both already on the video payload; no API change). Long names: `truncate` + `title`.
- Folder cards keep menus and drag-and-drop targets.

- [ ] **Step 1: Failing `project-page.spec.ts`:** `opening a folder puts ?folder in the URL; reload and back/forward restore it`; `unknown ?folder falls back to root with at most one toast`; `long names truncate` (create a project, folder and video titled with 90 Vietnamese characters; assert no element overflows the viewport at 375 px and the card has `title` = full name); `tab links reach trash, settings and members`.
- [ ] **Step 2–4:** FAIL → implement → specs + full suite + auth-visual + lint PASS; screenshots.
- [ ] **Step 5: Commit** `feat(web): filmic project grid with folder URLs`

### Task 6: Video review page and guest review page

**Files:** Modify `app/(dashboard)/projects/[projectId]/videos/[videoId]/page.tsx`, `app/review/[token]/page.tsx` (+ its layout), `components/video/{VideoPlayer,Timeline,AnnotationCanvas,ShareLinkPanel,ReviewStatusControl}.tsx`, `components/comments/*`, `components/export/ExportPanel.tsx`, `components/presence/UserPresence.tsx`.

**Interfaces:**
- Player area maximal; context panel collapsed by default (Task 4 hook). Timeline comment markers and comment timecodes in primary (timecodes as JetBrains Mono chips). Right panel stays the existing Tabs (Bình luận / Xuất) restyled.
- Keep every item in `design-system/pages/video-review.md` (single `lg` breakpoint, wrapping header, hidden frame-step under `sm`, ARIA live regions, `?` shortcuts dialog).
- Guest page: same restyle, no rail/panel.

- [ ] **Step 1:** Extend `video-review-responsive.spec.ts` and `guest-review-responsive.spec.ts` (failing where new): `timeline marker colour is primary`; `guest page has no rail`; existing 375 px assertions unchanged.
- [ ] **Step 2–4:** FAIL → implement → specs + full suite + auth-visual + lint PASS; screenshots of both pages, desktop/mobile.
- [ ] **Step 5: Commit** `feat(web): filmic video review and guest review pages`

### Task 7: Remaining signed-in screens

**Files:** Modify `app/(dashboard)/admin/page.tsx`, `app/(dashboard)/settings/profile/page.tsx`, `app/(dashboard)/projects/[projectId]/settings/page.tsx`, `app/invite/[token]/page.tsx`, `components/notifications/NotificationBell.tsx`, `components/upload/UploadQueuePanel.tsx`, `components/storage/StorageBar.tsx`, `components/video/CopyMoveDialog.tsx`, `components/common/ConfirmPermanentDelete.tsx`, `components/project/{MembersPanel,ActivityFeed}.tsx`.

**Interfaces:** Restyle only with Task 3 primitives and Task 2 tokens; admin keeps layout A (table + detail panel) and its behaviour/labels; no layout redesign beyond the shell.

- [ ] **Step 1:** Run full suite as the guard (no new spec needed unless a selector must change); capture "before" screenshots.
- [ ] **Step 2:** Implement; full suite + auth-visual + lint PASS; after screenshots; spot-check AA contrast of secondary text on new surfaces (report the ratios measured).
- [ ] **Step 3: Commit** `feat(web): filmic styling for admin, settings and dialogs`

### Task 8: Docs and final verification

**Files:** Modify `design-system/MASTER.md`, `design-system/pages/video-review.md`.

- [ ] **Step 1:** Update MASTER.md: primary = `#EF4444` (with the reason: sign-in anchor), semantic table, destructive-by-form rule, shell description, breakpoint; note the auth pages are pinned. Update video-review.md: new shell, guest page aligned.
- [ ] **Step 2:** Full verification: `npm run lint`, `cd apps/api && npm test` (unchanged API still green), full Playwright suite 0 skipped incl. `auth-visual`, manual browser pass of the five Review Focus items at 1440 and 375 px; screenshots of every signed-in page.
- [ ] **Step 3:** `git log` review of the plan's commits: no debug code, no `.env`, no snapshots other than the auth baseline.
- [ ] **Step 4: Commit** `docs(design): filmic workspace design system`
