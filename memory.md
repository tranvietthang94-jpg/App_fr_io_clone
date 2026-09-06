# MEMORY — Nhật ký triển khai & bài học (Frame.io Clone)

> Cập nhật: 2026-09-07. File này ghi lại mọi việc đã làm, sự cố đã gặp và bài học
> rút ra — **bao gồm cả thiếu sót** — để không ai (và không AI nào) lặp lại.

## 1. Trạng thái triển khai hiện tại

- **Production:** `https://app.warehousevn.cloud` — máy Windows này là host, uptime không cam kết 100%.
- **Kiến trúc:** Người dùng → Cloudflare Edge (HTTPS) → cloudflared (container, kết nối ra ngoài — không mở port, không sợ CGNAT FPT) → docker compose.
- **Stack:** `docker-compose.prod.yml` + overlay `docker-compose.tunnel.yml` — 5 containers: `app_frio_01-{postgres,redis,api,web,cloudflared}-1`.
- **Tunnel:** tên `frclone`, ID `b3809cd0-96fb-4604-ab8a-8f5a407bf9cf`, config tại `deploy/cloudflared/config.yml` (gitignored), credentials `deploy/cloudflared/credentials.json` (gitignored — mất file này phải tạo tunnel mới).
- **Uploads:** bind mount `F:\frclone-uploads` (file video nằm ngoài DB).
- **Domain:** `warehousevn.cloud` — DNS trên Cloudflare (NS: journey/yevgen.ns.cloudflare.com, đổi từ Mắt Bão). App ở subdomain `app.`, root đang trỏ GitHub Pages. SSL/TLS mode: Full (strict).
- **Google OAuth:** client "My Fr.I/O" (`837115053224-...apps.googleusercontent.com`), consent screen **In production**. Callback: `https://app.warehousevn.cloud/api/auth/google/callback`.
- **Backup:** Task Scheduler `frclone-pgdump` — 02:00 hằng ngày, `pg_dumpall` → `F:\frclone-backups`, giữ 14 ngày. **Lưu ý: chỉ cứu DB — video trong `F:\frclone-uploads` CHƯA có backup ổ đĩa (cần làm).**
- **Chưa bật (tùy chọn):** SMTP (email quên mật khẩu chỉ ghi log, không gửi thật), MinIO (uploads nằm ổ đĩa local).
- **Secrets:** tất cả trong `.env` ở repo root (gitignored). SecretsGenerate = `openssl rand -hex 32`.

## 2. Những việc đã làm (timeline)

1. **Review thay đổi chưa commit** → phát hiện XML export thiếu `${markersXml}` + `</sequence>` (Premiere sẽ từ chối import) → fix, kèm NTSC timebase đúng cho 29.97fps và đọc ffmpeg từ `FFMPEG_PATH` (commit `6206f29`).
2. **Siết test e2e export XML** — test cũ chỉ check `startsWith('<')`, XML hỏng vẫn pass; thay bằng DOMParser check node `parsererror`.
3. **Thống nhất TypeORM `^1.1.0`** — trước đó npm cài 2 bản song song (0.3.31 direct + 1.1.x từ @nestjs/typeorm@11) — rủi ro dual-instance (`6c1a9b0`).
4. **Kiểm chứng toàn diện:** tsc 0 lỗi cả 2 app, full e2e **53/53 pass**, rehearsal production qua `https://localhost` (Caddy) PASS: health, auth, cookie Secure, socket.io 101, upload→transcode, XML well-formed, PDF %PDF, stream token.
5. **Deploy Cloudflare Tunnel** (`698355b`): overlay compose + cloudflared config + runbook "Phương án B". Push toàn bộ lên GitHub.
6. **Verify end-to-end qua domain thật:** upload → transcode ready ≤4s, XML well-formed + 4 markers + timebase đúng, PDF thật, stream không-token 401 / có-token 200.
7. **Google OAuth live:** thêm env + restart api; publish consent screen; sửa Client ID bị chép sai.
8. **Fix video dọc tràn khung player** (`02c4f3f`) — xem sự cố #3.
9. **Backup tự động** — script `deploy/backup-pgdump.cmd` + Task Scheduler (`78af5f1`).

## 3. Sự cố & bài học — phần quan trọng nhất, đừng lặp lại

### 🔴 #1 — `rm` wildcard xóa file video PRODUCTION của user (2026-09-07)

- **Chuyện gì:** khi dọn dữ liệu test, chạy `rm /f/frclone-uploads/*.mp4` + `rm -rf transcoded/* ...` trên volume **đang có người dùng thật** → xóa mất 2 video thật của team (file gốc + rendition + thumbnail).
- **Hậu quả thực tế:** may mắn comment duy nhất trên video là comment test ("123213"), 0 annotation → mất chỉ là 2 file mà người upload còn bản gốc, đã re-upload lại. Nhưng đó là May mắn, không phải do xử lý đúng.
- **Bài học (BẮT BUỘC nhớ):**
  1. Trên production **KHÔNG BAO GIỜ** xóa bằng wildcard/pattern. Chỉ xóa đúng ID/email đã ghi nhận trong danh sách test cụ thể.
  2. Trước khi xóa: `SELECT`/`ls` liệt kê đúng đích, xóa sau, kiểm tra lại sau xóa.
  3. Không chạy thao tác phá hủy khi hệ thống đang có người dùng active.
  4. Backup DB 02:00 hằng ngày **không cứu được file video** — volume uploads cần backup riêng (chưa làm).

### #2 — XML export thiếu thẻ đóng `<sequence>`

- Template XMEML bị xóa nhầm markers cấp sequence + `</sequence>` → XML không well-formed, Premiere từ chối import — trong khi server vẫn trả HTTP 200.
- E2E test mang tên "well-formed" nhưng thật ra chỉ check `startsWith('<')` → **lỗi lọt qua cả test suite 53 test xanh**.
- **Bài học:** tên test phải tương ứng verification thật. HTTP 200 ≠ nội dung đúng — validate output bằng parser thật.

### #3 — Video dọc (9:16) tràn khung player

- `<video>` dùng `h-full` dựa vào chuỗi percentage-height xuyên qua nhiều tầng flex + `main` là scroll container → chain không resolve → video dọc tràn theo chiều cao tự nhiên (đo thật: 960×1705 trong viewport 900) rồi bị cắt.
- Video ngang "che" lỗi vô tình (chiều cao tự nhiên thấp hơn khung) → chỉ lộ khi có file dọc 2160×3840.
- **Fix:** anchor player root + `<video>` bằng `absolute inset-0` vào pane `relative` (tất cả 4 chỗ dùng đều có wrapper `relative`).
- **Bài học:** layout player đặt bằng inset-0 vào pane, đừng tin chuỗi `h-full` qua nhiều tầng flex/scroll; geometry phải đo bằng trình duyệt thật (Playwright evaluate getBoundingClientRect), không đoán bằng đọc code.

### #4 — cloudflared login mất cert trong container (authorize tới 3 lần)

- Image cloudflared là **distroless** (không có shell), chạy user `nonroot`, `HOME=/home/nonroot` → `cert.pem` ghi vào trong container, `--rm` là mất. `TUNNEL_ORIGIN_CERT` chỉ đổi nơi ĐỌC, không đổi nơi GHI.
- **Fix:** `-e HOME=/etc/cloudflared` (thư mục mount) → cert rơi ra host.
- **Bài học:** với `docker run --rm` tạo file artifact — kiểm tra NGAY file xuất hiện ở mount trước khi làm bước kế tiếp. Test mount 2 chiều bằng image alpine (distroless không có `sh` để test).

### #5 — Client ID Google bị chép sai từ ảnh chụp màn hình

- Đọc Client ID từ ảnh → thiếu 2/32 ký tự → `401 invalid_client` từ Google.
- **Bài học:** KHÔNG BAO GIỜ transcribe ID/token/secret dài từ ảnh chụp. Bắt buộc copy-paste dạng text.

### #6 — TypeORM cài 2 bản song song

- Direct dep `^0.3.20` + `@nestjs/typeorm@11` kéo về 1.1.x → 2 physical copies, rủi ro metadata dual-instance. Align lên `^1.1.0`, npm dedupe về 1 bản.

### #7 — Chạy e2e vào production đang có người dùng thật

- Config playwright vốn ghi rõ dành cho dev stack. Qua tunnel: share rate-limit bucket với user thật, JWT 15m (test dài dễ 401), tạo rác DB hiện cả trong UI của team, có thể văng 429 causing test fails KHÔNG phải do bug.
- Lần đầu chạy được 53/53 vì khi đó chưa có người thật; sau khi team vào dùng, spec bị fail môi trường.
- **Bài học:** e2e chỉ chạy vào dev/staging. Production chỉ smoke-test read-only + dữ liệu test phải có nhãn rõ (email `@test.local`) và dọn bằng ID cụ thể (xem #1).

## 4. Quy trình vận hành

- **Update app:** `git pull` → `docker compose --env-file .env -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build api` (hoặc `web`). Đổi `PUBLIC_URL` ⇒ phải rebuild **web** (NEXT_PUBLIC_* bake lúc build). Sửa entity ⇒ **backup pg_dump TRƯỚC** (dùng `synchronize:true`, không có migration để rollback).
- **Smoke test nhanh:** `curl https://app.warehousevn.cloud/api/health` → `{"status":"ok"}`.
- **Reboot máy:** Docker Desktop tự bật (đã set) → containers `restart: unless-stopped` tự sống; job transcode dở BullMQ tự nhặt lại. (Chưa test chu kỳ reboot lần nào — nên test 1 lần.)
- **Docker trên Git Bash (Windows):** mount path cần `MSYS_NO_PATHCONV=1` + `"$(pwd -W)/...:/container/path"`; image distroless không có shell — dùng alpine khi cần exec test.
- **Đang chờ làm:** backup ổ đĩa cho `F:\frclone-uploads`; test reboot; (tùy chọn) SMTP cho quên mật khẩu.
