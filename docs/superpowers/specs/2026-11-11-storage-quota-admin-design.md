# Storage quota & admin page — design

Date: 2026-11-11 · Status: draft for review

## Intent

The owner of this self-hosted Frame.io clone (the **super admin**) needs to control disk usage per person
and delegate parts of that work to other admins. Today anyone can upload until the disk is full: there is
no system-level admin, no quota, and videos don't even record who uploaded them.

Success: every account has a storage limit (15 GB by default, like Google Drive); uploads that would
exceed it are refused up front; the super admin can grant admin powers to existing accounts; admins can
set quotas, see every member's projects, and manage content in them.

## Goals

- Per-user storage quota, default **15 GB**, for existing and new accounts. Super admin is unlimited.
- The **uploader** is charged, regardless of whose project the video lands in.
- Only **original files** count (`Video.fileSize`). Transcoded renditions and thumbnails do not.
- Every version counts (each is its own original file).
- Videos in trash keep counting until purged (they still occupy disk).
- Over-quota uploads are refused at `POST /api/upload/init`, with a message stating free space vs. file size.
- Concurrent uploads cannot jointly overshoot the quota (space is reserved at init).
- Users over quota keep all their files and can view/download; they just can't add new uploads.
- Users see their usage in the sidebar ("Đã dùng 9.3 GB / 15 GB" with a bar).
- One super admin, identified by `SUPER_ADMIN_USER_ID` env var (not stored in DB, cannot be changed from the UI; see "Calls made by the designer").
- Super admin grants/revokes admin powers to any account that has logged in at least once. Admins cannot grant admin.
- Independently toggleable admin permissions (5 in total — see "Owner answers" for `PROJECT_INTERACT`):
  1. `QUOTA_GRANT` — set quota for a user who has no custom quota (i.e. is on the default)
  2. `QUOTA_ADJUST` — raise/lower an existing custom quota
  3. `PROJECT_VIEW` — view any member's projects (read-only)
  4. `PROJECT_CONTENT` — delete, move, copy, duplicate videos/folders inside any member's project.
     Requires `PROJECT_VIEW` (granting 4 auto-grants 3; revoking 3 revokes 4).
- Every admin action inside a project is written to that project's activity log.
- Admin page: layout **A** — one users table (search, usage bar, quota, role) + right-hand detail panel
  (quota edit, permission checkboxes — editable only by super admin, list of the user's projects).
  UI/UX polish is explicitly deferred; functionality first.

## Non-goals

- Deleting whole projects or user accounts from the admin page (permission 4 is content-level only).
- Quotas per project or per workspace (there is no workspace concept).
- Counting transcoded/thumbnail storage, billing, plans, or payments.
- Admin audit log beyond the per-project activity log.
- Polished admin UI (later pass).

## Anti-goals (would be failures even if it "works")

- Any path where a non-super-admin can make themselves or others admin, or demote the super admin.
- Over-quota users losing access to existing files, or files being deleted automatically.
- Two parallel uploads both passing the quota check when only one fits.
- `storageUsed` drifting with no way to repair it.
- Admin permission checks that only exist in the UI (every check must be enforced in the API).

## Constraints

- Monorepo: `apps/api` NestJS 11 + TypeORM (`synchronize` creates schema; there are no migrations —
  check how schema changes are applied in production (`deploy/README.md`) before relying on sync),
  `apps/web` Next.js 14 + Zustand, shared types in `packages/shared`.
- Project access today flows through `ProjectsService.findOne/assertRole/getMemberRole`
  (`apps/api/src/projects/projects.service.ts`); video ops call `assertEditorAccess` (`videos.service.ts`).
- Upload: `UploadService.init` (`apps/api/src/upload/upload.service.ts:72`) checks `MAX_FILE_SIZE` and
  EDITOR role; `complete` creates the Video with `uploadedBy: { userId, actorName }` — used only for the
  activity log, **not stored on the video**.
- Video files are removed from disk in `VideosService.purgeExpiredTrash` / `removeFilesFromDisk`;
  project delete cascades videos (check whether that path also removes files).
- Project rules (`CLAUDE.md`, `rule/agent.md`): smallest change, no new deps if avoidable, validate at
  trust boundaries, tests for non-trivial logic (`node:test` via `npm test` in `apps/api`), boot the API
  before declaring done (lint/unit tests do not catch Nest module/DI errors).

## Approaches considered

1. **Columns on existing tables + counter (chosen).** `users` gets `storageQuota`, `storageUsed`,
   `adminPermissions`; `videos` gets `uploadedById`; super admin from env; an `admin` module with a
   permission guard; reservations at upload init; a "recalculate" command repairs drift.
   Fewest tables, matches the codebase (project roles are a plain enum). Cost: `storageUsed` must be
   updated at every place that adds or frees an original file.
2. **No counter, `SUM(fileSize)` on demand.** Never drifts, but reserving space for concurrent uploads
   needs a lock or a separate reservations table anyway, and the admin table recomputes per user.
3. **Generic RBAC (roles/permissions tables, CASL).** Rejected: overkill for 4 fixed permissions and adds a dependency.

Chosen: **1**, by the owner, because it is the simplest option that still enforces concurrency correctly;
the recalc command covers drift.

## Decided design

### Data

- `users`:
  - `storageQuota` bigint, nullable. `NULL` = default (15 GB from `DEFAULT_STORAGE_QUOTA_BYTES` env,
    default 16106127360). A custom value is set by an admin.
  - `storageUsed` bigint, default 0 — bytes of original files attributed to the user, **including
    in-flight reservations**.
  - `adminPermissions` simple-array/enum-array of the 4 permissions, default empty.
  - "Has logged in at least once" = the account exists (local or Google). No extra column.
- `videos.uploadedById` uuid, nullable, FK users (ON DELETE SET NULL).
- Backfill (one-off, idempotent, part of the recalc command): `uploadedById` from the activity log
  entry for the video's upload; if none, the project's `ownerId`. Then `storageUsed` = SUM(fileSize) of
  the user's videos (including trashed, excluding purged) + active reservations.

### Super admin

- `SUPER_ADMIN_USER_ID` (env). The account with that id is super admin:
  unlimited quota, all 4 permissions implicitly, and the only one allowed to edit admin permissions.
- If unset, there is no super admin (feature still works for quotas; nobody can grant admin).

### Quota enforcement

- `UploadService.init`: in one DB transaction with a row lock on the uploader's `users` row
  (`SELECT … FOR UPDATE`), check `storageUsed + fileSize <= effectiveQuota` (skip for super admin);
  on success `storageUsed += fileSize` (reservation) and store the reserved size in the upload session metadata.
  On refusal: HTTP 413 (or 400 — builder's call, keep consistent) with message
  "Còn trống X, file cần Y — liên hệ admin để nâng dung lượng".
- On `complete`: video is created with `uploadedById`; reservation becomes usage (no counter change).
- On upload abort/failure/expiry: release the reservation (`storageUsed -= reserved`). The builder
  must find where abandoned upload sessions are cleaned up today and release there too; if nothing
  cleans them up, add release on explicit cancel and let the recalc command fix abandoned ones.
- On permanent removal of a video (trash purge, project cascade delete, any hard-delete path):
  `storageUsed -= fileSize` for `uploadedById`.
- Soft delete / restore: no change.
- Admin copy/duplicate: charges the **original uploader** (`uploadedById` of the source), with the same
  locked check; refuses if it would exceed their quota.

### Admin permissions & access

- A guard/decorator `@RequireAdmin(Permission.X)` for admin endpoints.
- Project access for admins is added in **one place**: `ProjectsService` role resolution. A user with
  `PROJECT_VIEW` gets read access to any project; with `PROJECT_CONTENT` gets editor-level rights for
  video/folder operations. Normal members are unaffected. The admin is not added as a project member.
- Admin actions inside a project write activity entries with the admin as actor.

### Admin operations (new) — see "Owner answers" below, which override this section where they differ

- `GET /api/admin/users?search=` — id, name, email, storageUsed, effective quota, isCustomQuota,
  permissions, isSuperAdmin. Requires any admin permission.
- `PATCH /api/admin/users/:id/quota { quotaBytes | null }` — `QUOTA_GRANT` if the user is on the
  default, `QUOTA_ADJUST` if they already have a custom quota. Validate: integer ≥ 0, sane upper bound.
  Lowering below current usage is allowed (user becomes over quota; nothing is deleted).
- `PATCH /api/admin/users/:id/permissions { permissions[] }` — super admin only; cannot target the super admin.
- `GET /api/admin/users/:id/projects` — `PROJECT_VIEW`.
- Content ops with `PROJECT_CONTENT` reuse existing endpoints (delete/move/restore, folders) via the
  role resolution above, plus new **copy** and **duplicate**:
  - duplicate = copy into the same project/folder;
  - copy = copy into another folder (target project: see open questions).
  - Copy creates a new Video row and a physical copy of the original file, then re-queues transcoding
    (or copies renditions — builder's call). Comments/annotations are not copied.
- `POST /api/admin/storage/recalculate` (super admin) — runs the backfill/recalc; also runnable as an npm script.

### User-facing

- `GET /api/auth/me` (or a new `/api/storage/me`) returns `storageUsed` and effective quota.
- Sidebar storage bar at the bottom of the dashboard layout.
- Upload UI shows the API's refusal message.

### Admin UI (layout A, minimal)

- Route `/admin` (hidden unless the user has any admin permission or is super admin).
- Users table: search, usage bar (green < 80%, amber < 100%, red ≥ 100%), quota, role.
- Detail panel: quota edit (enabled per permission), permission checkboxes (super admin only),
  user's project list linking to the normal project page (works via admin access).

## Left to the builder

- Exact HTTP status for quota refusal, the column type for `adminPermissions`, and whether copy
  duplicates renditions or re-transcodes.
- How schema changes reach production given `synchronize` (verify; document).
- Tests: quota check incl. concurrent init (two inits racing for the last slot), reservation release,
  purge decrement, permission matrix for each admin endpoint, super-admin-only permission edits,
  "admin cannot grant admin", backfill idempotency.

## Calls made by the designer (owner to check)

- **Super admin pinned by user id, not email.** Sign-up has no email verification, so `SUPER_ADMIN_EMAIL`
  would let whoever registers that address first take over. Use `SUPER_ADMIN_USER_ID` (uuid) in env;
  the recalc/admin npm script can print a user's id by email to help set it.
- **Admins cannot change their own quota** (closes self-escalation); the super admin is unlimited anyway.
- **Reservations expire 24 h after the upload's last chunk** (uploads stay resumable within that window).
  Expired sessions are released and their chunk folders removed by the recalc command and by a periodic
  cleanup (on API start + hourly, in-process timer — no new dependency). A new explicit cancel endpoint
  releases immediately.
- **Activity log entries for admin actions only** (new enum values for move/delete/restore/copy/duplicate,
  actor = admin). Regular members' actions keep today's logging.

## Owner answers (after builder check)

1. **Read-only by default, interaction is its own toggle.** New 5th permission `PROJECT_INTERACT`
   (comment, annotate, react, change review status, appear in presence) — **off by default** for every
   admin, so an admin can't accidentally change a project's state. Requires `PROJECT_VIEW`.
   `PROJECT_VIEW` alone = strictly read-only (view videos, comments, versions, stream; join the realtime
   room silently is NOT allowed — no presence). `PROJECT_CONTENT` = only delete / move / copy / duplicate
   (+ restore); it does **not** allow uploading or creating/revoking share links (designer's reading).
   ⇒ The "one place" fake-role approach does not hold: implement an explicit admin capability check
   next to the role ranks (e.g. `ProjectAccessService.can(user, project, Action)`), used by every
   affected entry point: project/video reads, comments/annotations/reactions, review status, gateway
   `join:video`, delete/move/restore/copy/duplicate.
2. **Copy across projects: allowed, to any project.** Target folder must belong to the target project.
   Copying a folder copies its subfolders and videos recursively; each copied file is charged to its
   own original uploader (whole operation refused up front if any uploader would exceed quota).
   Activity entry goes to the target project (and source project for move).
   Designer's reading: **move across projects is allowed too** (same rules, no storage change).
3. **Delete frees space immediately, with a strong double confirmation.**
   - New **"Xoá vĩnh viễn"** (permanent delete) for videos and folders: removes files from disk, then
     rows, then `storageUsed -= fileSize` for each uploader. Available to the project's EDITOR+ members
     and to admins with `PROJECT_CONTENT`, from the item menu and from the trash.
   - Confirmation, at least 2 steps: (1) a warning dialog stating what will be deleted (count, total
     size, "không thể khôi phục"); (2) a field where the user must type the **exact name** of the
     file/folder; paste from clipboard is allowed. The confirm button stays disabled until it matches.
   - The API also requires the name in the request body (`confirmName`) and rejects a mismatch — the
     check is not UI-only.
   - Existing "move to trash" stays as is (still counts until purged). Add a daily in-process purge of
     expired trash (30 days) so trash no longer depends on someone opening it.

Permission list is therefore **5**: `QUOTA_GRANT`, `QUOTA_ADJUST`, `PROJECT_VIEW`, `PROJECT_INTERACT`
(default off), `PROJECT_CONTENT`. Interact and Content each require View.
