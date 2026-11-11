# Storage Quota & Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user storage quotas (15 GB default, uploader charged, originals only), a super admin pinned by user id, five toggleable admin permissions, cross-project copy/move, and permanent delete with typed-name confirmation.

**Architecture:** A new `StorageModule` owns the per-user byte counter (row-locked reserve/charge/credit) and is the only code that destroys video files. A single `ProjectsService.authorize(projectId, userId, action)` replaces ad-hoc membership checks so member roles and admin permissions are resolved in one place. A new `AdminModule` exposes user/quota/permission endpoints; content ops (copy/duplicate/move/permanent delete) live in `VideosService`/`FoldersService` behind `authorize`.

**Tech Stack:** NestJS 11, TypeORM (`synchronize: true`, Postgres 15), Next.js 14 + Zustand + Tailwind, `node:test` via `npm test` (apps/api), Playwright (apps/web).

**Spec:** `docs/superpowers/specs/2026-11-11-storage-quota-admin-design.md` — read it first; this plan argues from it. The spec's "Owner answers" and "Calls made by the designer" sections override earlier sections where they differ.

## Global Constraints

- Default quota: `DEFAULT_STORAGE_QUOTA_BYTES` env, default `16106127360` (15 GiB). `users.storageQuota` NULL = default.
- Super admin: `SUPER_ADMIN_USER_ID` env (uuid). Unset ⇒ no super admin. Super admin = unlimited quota + all permissions + sole editor of admin permissions; cannot be targeted by permission or quota edits.
- Permissions (string enum values exactly): `quota_grant`, `quota_adjust`, `project_view`, `project_interact`, `project_content`. `project_interact` and `project_content` each imply/require `project_view` (granting either adds view; removing view removes both). `project_interact` is off by default.
- Charged party = `videos.uploadedById`. Only `Video.fileSize` counts. Trashed videos count until destroyed. Each version counts.
- Upload reservation expires 24 h after the newest file in the upload's chunk dir (`UPLOAD_RESERVATION_TTL_MS`, default `86400000`).
- Trash retention stays `TRASH_RETENTION_DAYS` (default 30); purge runs for all projects on API start and every 24 h.
- Quota refusal message (exact): `Còn trống ${formatBytes(free)}, file cần ${formatBytes(need)} — liên hệ admin để nâng dung lượng` with HTTP **413**.
- Permanent delete requires body `confirmName` equal (exact, case-sensitive, after `trim()`) to the item's display name; mismatch ⇒ 400 `Tên xác nhận không khớp`.
- Admins never get upload, rename, folder create/rename, share-link or project-settings/member rights through admin permissions (member-only, `ProjectAction.EDIT`).
- Admins cannot change their own quota. Only the super admin edits permissions.
- Admin actions inside a project are logged with the admin as actor; regular members' logging is unchanged.
- No new npm dependencies. Timers are plain `setInterval` cleared in `onModuleDestroy`.
- Every `bigint` column read from Postgres arrives as a string: new bigint columns use the `bigintNumber` transformer (Task 1); any arithmetic on existing `Video.fileSize` goes through `Number(...)`.
- Before declaring any API task done: boot the API (`scripts/devenv.ps1 start` + `npm run dev:api`) — lint and unit tests do not catch Nest DI/module-order errors.

## Review Focus

1. **`fileSize` arriving as string** — `storageUsed -= video.fileSize` must subtract numerically; a reviewer expects `"5" + ...` concatenation to be impossible. Test in Task 1 (`credit` with a string-typed size) and Task 3.
2. **Two uploads racing for the last free bytes** — expected: exactly one succeeds. Integration test against real Postgres in Task 1.
3. **Lowering a quota below current usage** — expected: allowed, user becomes over quota, nothing deleted, next upload refused, existing files still stream. Tests in Task 6 and Task 2.
4. **Copying a folder whose videos belong to several uploaders when one of them lacks space** — expected: nothing is copied and no counter changes. Test in Task 7.
5. **Admin with only `project_view` trying to comment, react, set review status or join the realtime room** — expected: 403 / socket error, no presence event. Tests in Task 5.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/api/src/storage/bigint.transformer.ts` | `bigintNumber` TypeORM transformer |
| `apps/api/src/storage/format-bytes.ts` | `formatBytes(n)` (vi-VN, GB/MB, 1 decimal) — also copied to web |
| `apps/api/src/storage/storage.service.ts` | quota math, row-locked reserve/charge/credit, `destroyVideos`, file removal |
| `apps/api/src/storage/storage-recalc.ts` | backfill `uploadedById` + recompute `storageUsed` |
| `apps/api/src/storage/storage.module.ts` | exports `StorageService` (deps: User, Video, ActivityLog, Project repos only) |
| `apps/api/src/admin/admin-permissions.ts` | `AdminPermission` enum, `normalizePermissions`, `isSuperAdminId`, `effectivePermissions` |
| `apps/api/src/projects/project-access.ts` | `ProjectAction` enum + pure `canPerform(role, perms, action)` |
| `apps/api/src/admin/admin.{module,controller,service}.ts`, `admin.guard.ts`, `dto/*.ts` | admin endpoints |
| `apps/api/src/scripts/storage-recalc.ts` | CLI entry (`npm run storage:recalc`) |
| `apps/web/app/(dashboard)/admin/page.tsx` | admin page, layout A |
| `apps/web/components/storage/StorageBar.tsx` | sidebar usage bar |
| `apps/web/components/common/ConfirmPermanentDelete.tsx` | 2-step typed-name dialog |
| `apps/web/components/video/CopyMoveDialog.tsx` | pick target project/folder |

---

### Task 1: Storage columns and `StorageService` core

**Files:**
- Create: `apps/api/src/storage/bigint.transformer.ts`, `format-bytes.ts`, `storage.service.ts`, `storage.module.ts`
- Modify: `apps/api/src/auth/user.entity.ts`, `apps/api/src/videos/video.entity.ts`, `apps/api/src/app.module.ts`, `apps/api/.env.example`
- Test: `apps/api/src/storage/storage.service.test.ts`, `apps/api/src/storage/storage.service.int.test.ts`, `apps/api/package.json` (`test:int` script)

**Interfaces:**
- Produces:
  - `User.storageQuota: number | null` (bigint, nullable, transformer), `User.storageUsed: number` (bigint, default 0, transformer), `User.adminPermissions: string[]` (`simple-array`, default `''`) — all three `select: true`.
  - `Video.uploadedById: string | null` (uuid, nullable, `ManyToOne(User, { onDelete: 'SET NULL' })`).
  - `bigintNumber: ValueTransformer` — `from: v == null ? null : Number(v)`, `to: v => v`.
  - `formatBytes(bytes: number): string` — e.g. `formatBytes(1288490188.8) === '1.2 GB'`, `formatBytes(524288000) === '500 MB'`.
  - `class QuotaExceededException extends HttpException` (413, message per Global Constraints).
  - `StorageService.defaultQuota(): number`
  - `StorageService.effectiveQuota(user: Pick<User,'id'|'storageQuota'>): number | null` — `null` = unlimited (super admin).
  - `StorageService.charge(userId: string, bytes: number, manager?: EntityManager): Promise<void>` — locks the user row (`SELECT … FOR UPDATE` via `manager.getRepository(User).findOne({ where:{id}, lock:{ mode:'pessimistic_write' } })`), throws `QuotaExceededException` if `storageUsed + bytes > quota`, else increments. Runs its own transaction when `manager` is omitted.
  - `StorageService.chargeMany(charges: Map<string, number>): Promise<void>` — one transaction, locks users in ascending id order, all-or-nothing.
  - `StorageService.credit(userId: string | null, bytes: number | string, manager?): Promise<void>` — `GREATEST(storageUsed - n, 0)`; no-op for null userId.
  - `StorageService.getUsage(userId): Promise<{ used: number; quota: number | null }>`

- [ ] **Step 1: Write failing unit tests** (`storage.service.test.ts`, plain-object repo/manager mocks like `auth.service.test.ts`):
  - `effectiveQuota returns default 16106127360 when storageQuota is null`
  - `effectiveQuota returns null for SUPER_ADMIN_USER_ID`
  - `charge throws QuotaExceededException with status 413 and the exact Vietnamese message when used+bytes > quota` — assert message `Còn trống 1 GB, file cần 2 GB — liên hệ admin để nâng dung lượng` for used = quota − 1 GiB, bytes = 2 GiB.
  - `charge allows exactly reaching the quota` (used + bytes === quota ⇒ ok)
  - `credit subtracts numerically when bytes is a string` — credit(u, '5') on used 10 ⇒ 5 (not `'105'`/NaN)
  - `credit never goes below 0`
  - `chargeMany charges nobody when one user lacks space`
  - `formatBytes` cases above.
- [ ] **Step 2:** `cd apps/api && npm test` — expect the new tests to FAIL (module not found).
- [ ] **Step 3:** Implement the files listed; register `StorageModule` in `AppModule`; add `DEFAULT_STORAGE_QUOTA_BYTES`, `SUPER_ADMIN_USER_ID`, `UPLOAD_RESERVATION_TTL_MS` (commented, with defaults) to `apps/api/.env.example`.
- [ ] **Step 4: Integration test** `storage.service.int.test.ts` (real Postgres from `.devenv`, connection from `apps/api/.env`; creates and drops its own user rows): `two concurrent charge() calls for the last free slot: exactly one rejects with QuotaExceededException and storageUsed equals quota`. Add `"test:int": "<same as test> \"src/**/*.int.test.ts\""` and make the existing `test` glob exclude `*.int.test.ts`.
- [ ] **Step 5:** `npm test` and `npm run test:int` PASS; root `npm run lint` PASS; boot API — tables get the new columns (`\d users` via `.devenv/pgsql/bin/psql`).
- [ ] **Step 6: Commit** `feat(api): add per-user storage counter and quota service`

### Task 2: Upload reserves quota; reservations expire

**Files:**
- Modify: `apps/api/src/upload/upload.service.ts`, `upload.controller.ts`, `upload.module.ts`, `apps/api/src/videos/videos.service.ts` (`create` accepts `uploadedById`)
- Test: `apps/api/src/upload/upload.service.test.ts`

**Interfaces:**
- Consumes: `StorageService.charge/credit` (Task 1).
- Produces:
  - `UploadMetadata.reservedBytes: number` (written at init).
  - `UploadService.cancelUpload(uploadId: string, userId: string): Promise<{ success: true }>` → `DELETE /api/upload/:uploadId` (owner only, 403 otherwise): credits `reservedBytes`, removes the chunk dir.
  - `UploadService.cleanupExpiredUploads(now = Date.now()): Promise<number>` — for each chunk dir whose newest mtime (metadata.json or any chunk) is older than TTL: credit `reservedBytes` to `metadata.userId`, remove dir; returns count. Runs on module init and hourly (`setInterval`, cleared in `onModuleDestroy`).
  - `VideosService.create({... uploadedById?: string })` stores it.
- Behaviour: `initUpload` calls `storage.charge(userId, fileSize)` **after** the role, size and type checks and **before** creating the chunk dir; if writing metadata fails, credit back. `completeUpload` passes `uploadedById: userId`; no counter change. If `completeUpload` fails after concat (exception), the reservation stays (still resumable/cancellable, expires via TTL).

- [ ] **Step 1: Failing tests:**
  - `initUpload charges the uploader fileSize and records reservedBytes in metadata.json` (temp dir via `process.chdir` or injectable root — keep the existing `process.cwd()` layout; use `fs.mkdtempSync` + `process.chdir` in the test)
  - `initUpload refuses with 413 and creates no chunk dir when over quota`
  - `cancelUpload credits reservedBytes and deletes the dir; another user gets 403`
  - `cleanupExpiredUploads releases only sessions older than 24h` (set mtimes with `fs.utimesSync`)
  - `completeUpload creates the video with uploadedById = uploader and does not charge again`
- [ ] **Step 2:** run, FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test` PASS, lint PASS, boot API.
- [ ] **Step 5: Commit** `feat(api): reserve quota at upload init and expire stale uploads`

### Task 3: One place destroys files — trash purge, daily purge, project delete

**Files:**
- Modify: `apps/api/src/storage/storage.service.ts`, `apps/api/src/videos/videos.service.ts`, `apps/api/src/projects/projects.service.ts`, `projects.module.ts`, `videos.module.ts`
- Test: `apps/api/src/storage/storage.service.test.ts`, `apps/api/src/videos/videos.service.test.ts`

**Interfaces:**
- Produces:
  - `StorageService.destroyVideos(videos: Video[]): Promise<void>` — for each: remove original, `uploads/transcoded/<id>`, `uploads/thumbnails/<id>.jpg` (moved here from `VideosService.removeFilesFromDisk`, keep its best-effort logging); then remove rows; then `credit(uploadedById, Number(fileSize))` per video (aggregate per user). Files before rows (existing rationale).
  - `VideosService.purgeAllExpiredTrash(): Promise<number>` — all projects; run on init + every 24 h. `purgeExpiredTrash(projectId)` delegates to `destroyVideos`.
  - `ProjectsService.delete` loads every video of the project (incl. trashed) and calls `destroyVideos` before removing the project (fixes today's disk leak).
  - Remove the unused `VideosService.delete(id)` (no callers) and `removeFilesFromDisk`.

- [ ] **Step 1: Failing tests:** `destroyVideos removes files then rows then credits each uploader once with the summed numeric size`; `destroyVideos still credits when a file is already missing`; `purgeAllExpiredTrash destroys only videos trashed > TRASH_RETENTION_DAYS ago across projects`; `deleting a project destroys its videos' files and credits uploaders`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npm test`, lint, boot API.
- [ ] **Step 5: Commit** `fix(api): free disk and quota when videos or projects are destroyed`

### Task 4: Backfill and recalculation

**Files:**
- Create: `apps/api/src/storage/storage-recalc.ts`, `apps/api/src/scripts/storage-recalc.ts`
- Modify: `apps/api/package.json` (`"storage:recalc": "ts-node -r tsconfig-paths/register src/scripts/storage-recalc.ts"`), `SETUP.md` (3 lines: run after deploying this feature; how to find your user id: `npm run storage:recalc -- --whois <email>`)
- Test: `apps/api/src/storage/storage-recalc.test.ts`

**Interfaces:**
- Produces: `recalculateStorage(ds: DataSource, opts: { now?: number; uploadsRoot?: string }): Promise<{ backfilled: number; users: number }>`:
  1. `UPDATE videos SET uploadedById = <actorId of earliest activity_logs row with type='video_uploaded' AND videoId = videos.id AND actorId IS NOT NULL>` where `uploadedById IS NULL`; remaining NULLs ← `projects.ownerId`.
  2. `storageUsed = COALESCE(SUM(videos.fileSize) by uploadedById, 0) + SUM(reservedBytes of non-expired chunk sessions by userId)` for every user, in one transaction.
- The CLI boots `NestFactory.createApplicationContext(AppModule)` like `database/seed.ts`; `--whois <email>` prints that user's id and exits.
- `POST /api/admin/storage/recalculate` (super admin) is added in Task 6 and calls the same function.

- [ ] **Step 1: Failing tests** (fake `DataSource.query` recorder or the int-test DB — choose int-test, name it `storage-recalc.int.test.ts`): `backfills uploadedById from the upload activity log, falls back to project owner`; `running twice yields identical storageUsed (idempotent)`; `counts trashed videos and live reservations, ignores expired reservations`.
- [ ] **Step 2–4:** FAIL → implement → `npm run test:int`, `npm test`, lint, run `npm run storage:recalc` against the dev DB.
- [ ] **Step 5: Commit** `feat(api): backfill uploader and recalculate storage usage`

### Task 5: Admin permissions and single project authorization

**Files:**
- Create: `apps/api/src/admin/admin-permissions.ts`, `apps/api/src/projects/project-access.ts`
- Modify: `apps/api/src/projects/projects.service.ts`, `projects.controller.ts`, `apps/api/src/videos/videos.service.ts`, `videos.controller.ts`, `folders.service.ts`, `apps/api/src/comments/comments.controller.ts`, `annotations.controller.ts`, `reactions.controller.ts`, `apps/api/src/export/export.controller.ts`, `export.service.ts`, `apps/api/src/gateway/collaboration.gateway.ts`, `apps/api/src/share-links/share-links.service.ts`, `apps/api/src/upload/upload.service.ts`
- Test: `apps/api/src/projects/project-access.test.ts`, `apps/api/src/projects/projects.service.test.ts`, extend `apps/api/src/gateway/collaboration.gateway.test.ts`

**Interfaces:**
- Produces:
  - `enum AdminPermission { QUOTA_GRANT='quota_grant', QUOTA_ADJUST='quota_adjust', PROJECT_VIEW='project_view', PROJECT_INTERACT='project_interact', PROJECT_CONTENT='project_content' }`
  - `isSuperAdminId(userId: string): boolean` (reads `process.env.SUPER_ADMIN_USER_ID` at call time).
  - `normalizePermissions(input: string[]): AdminPermission[]` — drops unknown values, dedupes, adds VIEW if INTERACT/CONTENT present.
  - `effectivePermissions(user: { id: string; adminPermissions: string[] }): AdminPermission[]` — all five for super admin.
  - `enum ProjectAction { READ, INTERACT, CONTENT, EDIT, MANAGE }`
  - `canPerform(role: MemberRole | null, perms: AdminPermission[], action: ProjectAction): boolean`:
    - member: READ/INTERACT ⇐ any role; CONTENT/EDIT ⇐ EDITOR+; MANAGE ⇐ ADMIN+.
    - admin perms (only when member check fails): READ ⇐ `project_view`; INTERACT ⇐ `project_interact`; CONTENT ⇐ `project_content`; EDIT/MANAGE never.
  - `ProjectsService.authorize(projectId: string, userId: string, action: ProjectAction): Promise<{ project: Project; role: MemberRole | null; viaAdmin: boolean }>` — 404 if not READ-able, 403 if READ-able but not the action.
  - `ProjectsService.findOne(id, userId)` = `authorize(READ).project`; `assertRole(id, userId, minRole)` stays **member-only** (unchanged semantics) for EDIT/MANAGE call sites.
  - `VideosService.findOwned(id: string, userId: string, action = ProjectAction.READ)`.
  - `GET /api/projects/:id` response adds `myAccess: { role: MemberRole | null; canInteract: boolean; canContent: boolean; canEdit: boolean; canManage: boolean; viaAdmin: boolean }`.
- Call-site mapping (exhaustive — grep `findOwned|findOne\(|assertRole|assertEditorAccess` after the change and check each):
  - READ: project/video/folder/trash/versions/stream-token/stream/thumbnail reads, comments/annotations GET, export.
  - INTERACT: comments POST/PATCH/DELETE, annotations POST/DELETE, reactions POST/DELETE, `setReviewStatus` (was `assertRole(REVIEWER)`), gateway `join:video` (was `findOwned`).
  - CONTENT: `move`, `softDelete`, `restore`, folder `delete`, and Task 7's new ops (`assertEditorAccess` becomes `authorize(CONTENT)` for these only).
  - EDIT (member-only, unchanged `assertRole(EDITOR)`): upload init/complete, `rename`, folder create/rename, share links.
  - MANAGE (unchanged `assertRole(ADMIN)`): project update/delete, members.
  - `findAll` (sidebar project list) unchanged — admins reach others' projects via the admin page.
- Add `ActivityType` values `ADMIN_VIDEO_MOVED='admin_video_moved'`, `ADMIN_VIDEO_TRASHED='admin_video_trashed'`, `ADMIN_VIDEO_RESTORED='admin_video_restored'`, `ADMIN_FOLDER_DELETED='admin_folder_deleted'`; `move/softDelete/restore`/folder `delete` record them only when `authorize(...).viaAdmin === true` (actor = admin, payload `{ videoTitle | folderName }`). Members' behaviour unchanged. Test: `admin softDelete records admin_video_trashed; member softDelete records nothing new`.

- [ ] **Step 1: Failing tests:**
  - `project-access.test.ts`: full matrix table test — for each of {non-member + [], [view], [view,interact], [view,content]} × {REVIEWER, EDITOR, ADMIN member} × each action, assert `canPerform` per the rules above (write the expected table literally).
  - `normalizePermissions(['project_content','bogus']) deep-equals ['project_content','project_view']` (order: enum order).
  - `projects.service.test.ts`: `authorize returns 404 for a stranger, 403 for view-only admin on INTERACT, ok with viaAdmin=true for view admin on READ`; `super admin passes CONTENT on any project`.
  - gateway: `view-only admin join:video gets error and no user:joined broadcast`; `interact admin joins`.
- [ ] **Step 2:** FAIL. **Step 3:** implement and switch every call site per the mapping.
- [ ] **Step 4:** `npm test` (all old tests still green), lint, boot API, Playwright full suite still green (member behaviour unchanged).
- [ ] **Step 5: Commit** `feat(api): resolve project access for members and admins in one place`

### Task 6: Admin API

**Files:**
- Create: `apps/api/src/admin/admin.module.ts`, `admin.controller.ts`, `admin.service.ts`, `admin.guard.ts`, `dto/update-quota.dto.ts`, `dto/update-permissions.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/auth/auth.service.ts` (`toPublicUser`)
- Test: `apps/api/src/admin/admin.service.test.ts`

**Interfaces:**
- Consumes: Task 1 `StorageService`, Task 4 `recalculateStorage`, Task 5 `effectivePermissions`, `normalizePermissions`, `isSuperAdminId`.
- Produces:
  - `@RequireAdmin(...perms: AdminPermission[])` decorator + `AdminGuard` (JWT required; passes if user has **any** listed permission; with no args = any admin permission or super admin). Loads the user fresh from DB each request (permissions revoke immediately).
  - `GET /api/admin/users?search=&offset=&limit=` (`@RequireAdmin()`) → `{ items: AdminUserRow[], total }`, `AdminUserRow = { id, name, email, avatarUrl, storageUsed, storageQuota /*effective, null=unlimited*/, isCustomQuota, permissions: AdminPermission[], isSuperAdmin, projectCount }`; search ILIKE on name/email; limit ≤ 100.
  - `PATCH /api/admin/users/:id/quota` body `UpdateQuotaDto { quotaBytes: number | null }` (`@IsOptional() @IsInt() @Min(0) @Max(2**50)`, null = back to default). Rules: target is super admin ⇒ 400; target is self ⇒ 403 `Không thể tự chỉnh dung lượng của mình`; target on default (`storageQuota IS NULL`) needs `quota_grant`; target with custom quota needs `quota_adjust`; setting null needs `quota_adjust`. Below current usage is allowed.
  - `PATCH /api/admin/users/:id/permissions` body `{ permissions: string[] }` (`@IsArray() @IsString({each:true}) @ArrayMaxSize(10)`) — super admin only (403 otherwise); target super admin ⇒ 400; stores `normalizePermissions`.
  - `GET /api/admin/users/:id/projects` (`project_view`) → projects where the user is an accepted member, with `{ id, name, ownerId, role }`.
  - `GET /api/admin/projects?search=` (`project_view`) → `{ id, name, ownerName }[]` (limit 50) — used by Task 10's copy/move target picker.
  - `POST /api/admin/storage/recalculate` — super admin only.
  - `toPublicUser` adds `storageUsed`, `storageQuota` (effective), `adminPermissions` (effective), `isSuperAdmin`.
  - Admin quota/permission changes are not project activity (no project) — log with Nest `Logger` at `log` level: actor id, target id, old → new.

- [ ] **Step 1: Failing tests:** `quota_grant admin can set quota for a default user but not change a custom one`; `quota_adjust admin can change a custom quota and reset to null`; `admin cannot change own quota (403)`; `nobody can change super admin quota (400)`; `lowering quota below usage succeeds and storageUsed is untouched`; `only super admin edits permissions; admin with every permission gets 403`; `permissions are normalized (content adds view)`; `revoked permission takes effect on the next request` (guard reloads user); `list search matches email case-insensitively`.
- [ ] **Step 2–4:** FAIL → implement → `npm test`, lint, boot API, curl each endpoint with a super-admin token (set `SUPER_ADMIN_USER_ID` in local `.env` via `npm run storage:recalc -- --whois <email>`).
- [ ] **Step 5: Commit** `feat(api): admin endpoints for users, quotas and permissions`

### Task 7: Content ops — copy, duplicate, cross-project move, permanent delete

**Files:**
- Modify: `apps/api/src/videos/videos.service.ts`, `videos.controller.ts`, `folders.service.ts`, `folders.controller.ts`, `apps/api/src/activity/activity-log.entity.ts`, `apps/api/src/videos/dto/*` (new DTOs)
- Test: `apps/api/src/videos/content-ops.test.ts`

**Interfaces:**
- Consumes: `authorize` (Task 5), `StorageService.chargeMany/destroyVideos` (Tasks 1, 3).
- Produces (all `authorize(CONTENT)` on source **and** target project; members need EDITOR+ there, admins `project_content`):
  - `POST /api/videos/:id/copy` body `{ targetProjectId: string (uuid), targetFolderId: string|null }` → new Video. Copies the **viewed version only** as a new asset (new `assetGroupId`, `versionNumber` 1, same title, `uploadedById` = source's, `status`/dimensions/duration copied). Files: `fs.copyFile` original to `uploads/<newUuid>_<sanitized originalFilename>`; `fs.cp` `uploads/transcoded/<srcId>` → `<newId>` and thumbnail if present; if source `status !== 'ready'`, enqueue transcode instead. Charge `fileSize` to the original uploader (`chargeMany`); on any file-copy failure, remove partial files and credit back. Comments, annotations and share links are not copied.
  - `POST /api/videos/:id/duplicate` = copy into the source's own project and folder.
  - `POST /api/folders/:id/copy` body `{ targetProjectId, targetParentFolderId: string|null }` — recursive (subfolders + latest non-trashed version of every asset). Compute charges per uploader first → `chargeMany` (all-or-nothing) → copy. Target parent must belong to the target project; a folder cannot be copied into itself/descendant (400).
  - `PATCH /api/videos/:id/move` body gains optional `targetProjectId`; cross-project moves **every version** of the asset group (and clears `folderId` if the target folder is not in the target project ⇒ 400 instead). No storage change. Activity in both projects.
  - `DELETE /api/videos/:id/permanent` body `{ confirmName: string }` — must equal `video.title`; destroys **all versions** of the asset group (`destroyVideos`).
  - `DELETE /api/folders/:id/permanent` body `{ confirmName }` — must equal `folder.name`; destroys every video (all versions, incl. trashed) in the folder tree, then the folders.
  - `GET /api/videos/:id/delete-preview` and `GET /api/folders/:id/delete-preview` → `{ name, videoCount, totalBytes }` for the confirmation dialog (READ access).
  - Trash UI's "Xoá vĩnh viễn" uses the same endpoint.
  - New `ActivityType` values: `VIDEO_COPIED='video_copied'`, `VIDEO_MOVED_PROJECT='video_moved_project'`, `VIDEO_DELETED_PERMANENTLY='video_deleted_permanently'`, `FOLDER_COPIED='folder_copied'`, `FOLDER_DELETED_PERMANENTLY='folder_deleted_permanently'` — recorded for **every** actor for these new ops (they're new, there is no prior member behaviour to keep); payload includes `{ viaAdmin }`.

- [ ] **Step 1: Failing tests:** `copy charges the original uploader, not the actor`; `copy to a project where the actor lacks CONTENT is 403`; `copy refused with 413 leaves no file and no row`; `folder copy with two uploaders where one lacks space copies nothing and charges nobody`; `folder copy into its own descendant is 400`; `cross-project move moves all versions and keeps storage unchanged`; `permanent delete with wrong confirmName is 400 and deletes nothing`; `permanent delete of an asset destroys all versions and credits each uploader`; `folder permanent delete includes trashed videos in subfolders`; `REVIEWER member cannot permanent-delete (403)`.
- [ ] **Step 2–4:** FAIL → implement → `npm test`, lint, boot API, exercise copy + permanent delete with curl on a real video and check `uploads/` and `storageUsed`.
- [ ] **Step 5: Commit** `feat(api): copy, duplicate, cross-project move and permanent delete`

### Task 8: Web — shared types, storage bar, quota error

**Files:**
- Modify: `packages/shared/src/types/index.ts` (`User` gains `storageUsed: number; storageQuota: number | null; adminPermissions: string[]; isSuperAdmin: boolean`), `apps/web/lib/api.ts` (admin + content-op client functions, `getMe`), `apps/web/app/(dashboard)/layout.tsx`, `apps/web/lib/uploadManager.ts` (surface 413 message as the row's error, non-retryable)
- Create: `apps/web/components/storage/StorageBar.tsx`, `apps/web/lib/formatBytes.ts` (same output as the API's)

**Interfaces:**
- `StorageBar` reads `useAuthStore().user`; refreshes via `getMe()` on mount and after each upload completes/fails. Text: `Đã dùng ${formatBytes(used)} / ${quota === null ? 'Không giới hạn' : formatBytes(quota)}`; bar colour green < 80 %, amber < 100 %, red ≥ 100 %.
- 413 from `initUpload` ⇒ row status error with the API message verbatim, no retry.

- [ ] **Step 1:** Playwright spec `apps/web/tests/e2e/storage-quota.spec.ts` (failing): `sidebar shows usage after upload` (value increases by the fixture's size); `upload over quota shows "Còn trống" message and no retry` (set the test user's quota low via the super-admin API in `beforeAll`; super admin id from `SUPER_ADMIN_USER_ID` of the running API — document required env in the spec header).
- [ ] **Step 2–4:** FAIL → implement → spec PASS, `npm run lint` PASS, check in the browser.
- [ ] **Step 5: Commit** `feat(web): show storage usage and quota refusal`

### Task 9: Web — admin page (layout A)

**Files:**
- Create: `apps/web/app/(dashboard)/admin/page.tsx`
- Modify: `apps/web/app/(dashboard)/layout.tsx` (sidebar "Quản trị" link, shown when `isSuperAdmin || adminPermissions.length > 0`)

**Interfaces:**
- Table: search box (debounced 300 ms), columns Người dùng / Đã dùng (bar) / Quota / Vai trò (`Super admin` | `Admin` | `—`), paginated 50/page.
- Detail panel for the selected row: quota editor (GB input, "Mặc định" button = null) enabled per `quota_grant`/`quota_adjust` rules and disabled for self/super admin; five permission checkboxes (labels: `Cấp dung lượng`, `Điều chỉnh dung lượng`, `Xem project`, `Tương tác trong project (bình luận, duyệt)`, `Xoá / di chuyển / copy nội dung`) editable only by super admin, with Interact/Content auto-checking View and unchecking View clearing both; project list linking to `/projects/:id`.
- Super admin also sees a "Tính lại dung lượng" button (recalculate).
- Non-admins visiting `/admin` get redirected to `/projects`.

- [ ] **Step 1:** Playwright spec `apps/web/tests/e2e/admin.spec.ts` (failing): `super admin grants project_view to a user and that user can open another member's project read-only (no comment box)`; `admin with quota_grant sets 1 GB for a default user and the table updates`; `non-admin is redirected from /admin`.
- [ ] **Step 2–4:** FAIL → implement → PASS, lint, browser check.
- [ ] **Step 5: Commit** `feat(web): admin page for users, quotas and permissions`

### Task 10: Web — content ops UI and access-aware project page

**Files:**
- Create: `apps/web/components/common/ConfirmPermanentDelete.tsx`, `apps/web/components/video/CopyMoveDialog.tsx`
- Modify: `apps/web/components/dashboard/VideoCard.tsx` (menu: Nhân bản, Copy sang…, Di chuyển sang project…, Xoá vĩnh viễn), folder menu in `apps/web/app/(dashboard)/projects/[projectId]/page.tsx`, trash view (Xoá vĩnh viễn), video review page + `CommentPanel.tsx` (hide composer/review-status controls when `!myAccess.canInteract`; don't connect the realtime socket room when `!canInteract`)

**Interfaces:**
- `ConfirmPermanentDelete({ name, kind: 'video'|'folder', preview: { videoCount, totalBytes }, onConfirm(confirmName) })`: step 1 warning (`Xoá vĩnh viễn ${videoCount} video (${formatBytes(totalBytes)}). Không thể khôi phục.` + "Tiếp tục"); step 2 input labelled `Nhập chính xác tên "${name}" để xác nhận` (paste allowed, no `onPaste` blocking), confirm button disabled until `value.trim() === name`.
- `CopyMoveDialog({ mode: 'copy'|'move', sourceProjectId, onSubmit(targetProjectId, targetFolderId) })` lists target projects: the user's own projects (`findAll`; the API rejects targets without CONTENT with 403, shown as a toast), plus — when `adminPermissions` includes `project_content` — a search over all projects via Task 6's `GET /api/admin/projects?search=`. After picking a project it loads that project's folders for the folder choice (root allowed).
- Menu items render only when `myAccess.canContent`; Rename/Upload version/Share only when `myAccess.canEdit`.

- [ ] **Step 1:** Playwright spec `apps/web/tests/e2e/content-ops.spec.ts` (failing): `permanent delete needs both steps and the exact name; pasted name works; storage bar drops`; `duplicate creates a second card with the same title`; `copy to another project appears there`; `view-only admin sees no menu items and no comment composer`.
- [ ] **Step 2–4:** FAIL → implement → PASS, lint, browser check.
- [ ] **Step 5: Commit** `feat(web): copy, move and permanent delete in the project UI`

### Task 11: Full verification

- [ ] `cd apps/api && npm test && npm run test:int` — all PASS.
- [ ] Root `npm run lint` — PASS.
- [ ] Boot API + web on the devenv stack; `npm run storage:recalc`; full Playwright suite in `apps/web` — all PASS, 0 skipped.
- [ ] Manual browser pass of the five Review Focus items.
- [ ] `git log` review of every commit in this plan; no debug code, no `.env` committed.
