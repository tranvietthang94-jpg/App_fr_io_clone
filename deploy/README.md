# Deploy runbook

## Phương án B (HIỆN TẠI) — Cloudflare Tunnel, máy nhà làm host

Người xem → **Cloudflare Edge** (HTTPS, cert tự động) → **cloudflared** (container chạy
trên máy host, kết nối RA NGOÀI nên không cần mở port, không sợ CGNAT của FPT) →
`docker-compose.prod.yml` (web/api/postgres/redis). Video lưu ổ đĩa máy host (bind mount).

Chi phí 0đ (Cloudflare Free). Không VPS, không Tailscale, không IP public, không static IP.

Giới hạn Cloudflare Free đã đối chiếu với thiết kế app: body tối đa 100MB/request
(upload là chunk 5MB ✓), timeout 100s (transcode async qua BullMQ ✓), WebSocket ✓.

### 0. Chuẩn bị máy host (Windows)
- Docker Desktop: bật "Start Docker Desktop when you sign in"; Windows tự đăng nhập sau boot.
- Power: không sleep khi cắm điện; BIOS bật "Restore on AC Power Loss" (mất điện tự boot).
- Thư mục lưu video, vd `F:\frclone-uploads` (tạo sẵn, còn nhiều dung lượng).

### 1. Domain về Cloudflare (1 lần — chờ DNS 15–45')
1. Tạo tài khoản Cloudflare Free → Add site → lấy 2 nameserver Cloudflare cấp.
2. Ở nhà đăng ký tên miền (Mắt Bão): đổi nameserver của domain sang 2 NS đó.

### 2. Tạo tunnel (1 lần — chạy ở repo root, PowerShell/cmd)
```powershell
# login: lệnh in ra URL — mở trên browser, đăng nhập Cloudflare, chọn domain
docker run -it --rm -v "${PWD}\deploy\cloudflared:/etc/cloudflared" cloudflare/cloudflared:latest tunnel login
# tạo tunnel — sinh file deploy\cloudflared\<TUNNEL-ID>.json
docker run -it --rm -v "${PWD}\deploy\cloudflared:/etc/cloudflared" cloudflare/cloudflared:latest tunnel create frclone
# đổi tên file <TUNNEL-ID>.json thành credentials.json
```
(Git Bash: thêm prefix `MSYS_NO_PATHCONV=1` vào từng lệnh để không bị đổi path.)

### 3. Cấu hình + trỏ DNS
```powershell
Copy-Item deploy\cloudflared\config.yml.example deploy\cloudflared\config.yml
# Mở config.yml: điền <TUNNEL-ID> (field TunnelID trong credentials.json) + domain thật vào 3 dòng hostname
docker run --rm -v "${PWD}\deploy\cloudflared:/etc/cloudflared" cloudflare/cloudflared:latest tunnel route dns frclone app.tenmiencuaban.com
```

### 4. Chạy stack
```powershell
Copy-Item deploy\env.prod.example .env   # điền: PUBLIC_URL=https://app.tenmiencuaban.com,
                                         # UPLOADS_HOST_DIR=F:/frclone-uploads, secrets (openssl rand -hex 32)
docker compose --env-file .env -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build
```
- `docker-compose.tunnel.yml` thêm service cloudflared + ép api/web chỉ bind `127.0.0.1` (debug nội bộ, không phơi LAN).
- Video stream qua Cloudflare: playback bình thường dùng Range request; nếu sau này cần tải file gốc dung lượng lớn, cân nhắc route tải trực tiếp LAN.

### 5. Verify end-to-end (https://app.tenmiencuaban.com)
1. Web load, cert hợp lệ (Cloudflare edge cert).
2. Login → DevTools: cookie `refreshToken` có cờ **Secure**.
3. Network: **`/socket.io/` WebSocket = 101**.
4. Upload video → transcode `ready` + progress realtime; file nằm trong thư mục uploads máy host.
5. Export PDF (puppeteer) + XML (validate well-formed); guest share-link ở tab ẩn danh 4G.
6. `docker exec <api> ffmpeg -encoders | grep libx264` đủ codec.
7. Reboot máy → stack tự sống lại (`restart: unless-stopped`), job dở BullMQ nhặt lại.

### 6. Backup (bắt buộc — thay cho migration)
Task Scheduler hằng ngày:
```powershell
docker exec app_frio_01-postgres-1 pg_dumpall -U frclone | gzip > F:\frclone-backups\pg-$(Get-Date -F yyyy-MM-dd).sql.gz
# xoá bản > 14 ngày: forfiles /P F:\frclone-backups /M pg-*.sql.gz /D -14 /C "cmd /c del @path"
```
Cân nhắc copy thêm `F:\frclone-uploads` ra ổ/đích khác định kỳ.

---

## Phương án A (dự phòng) — mini PC + VPS + Tailscale

Người xem → **VPS** (Caddy, HTTPS công khai) → hầm **Tailscale** → **mini PC** (docker-compose: web/api/postgres/redis). Một domain duy nhất, Caddy định tuyến theo path.

## 0. Chuẩn bị
- VPS VN nhỏ (chỉ chạy Caddy + Tailscale — gói rẻ nhất đủ) + mini PC cài **Ubuntu LTS**.
- **Đo upload mạng nhà** ≥ ~60 Mbps (10 luồng 1080p). UPS cho mini PC + router.
- Tên miền ở Mắt Bão.

## 1. DNS (Mắt Bão)
id.matbao.net → **Tên miền** → **Quản lý tên miền** → chọn tên miền → tab **Bản ghi DNS** → **Tạo bản ghi**:
`Loại = A`, `Host = app` (hoặc `@`), `Value = IP public của VPS`, TTL mặc định. Chờ 15–45' propagate.

## 2. Tailscale (chạy trên HOST của cả VPS và mini PC)
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                 # đăng nhập qua URL
sudo systemctl enable --now tailscaled
tailscale ip -4                   # ghi lại IP 100.x.y.z của MINI PC
```
Verify từ VPS sau khi app chạy: `curl http://100.x.y.z:4000/api/health` → `{"status":"ok"}`.

## 3. Mini PC — chạy app
```bash
sudo mkdir -p /srv/frclone/uploads
git clone <repo> && cd <repo>
cp deploy/env.prod.example .env   # rồi điền secrets (openssl rand -hex 32) + PUBLIC_URL
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
# Firewall: chỉ cho Tailscale chạm 3000/4000
sudo ufw allow in on tailscale0 && sudo ufw allow OpenSSH && sudo ufw enable
```
Verify nội bộ: `curl 127.0.0.1:4000/api/health` → 200; `curl -I 127.0.0.1:3000` → 200/redirect.

## 4. VPS — Caddy
```bash
# cài Caddy (xem caddyserver.com/docs/install cho Ubuntu)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # sửa domain + IP 100.x.y.z
sudo systemctl reload caddy                      # Caddy tự xin cert Let's Encrypt
```

## 5. Verify end-to-end (https://app.tenmien.com)
1. Web load, cert hợp lệ.
2. Login → DevTools: cookie `refreshToken` có cờ **Secure**.
3. Mở project → Network: **`/socket.io/` WebSocket = 101** (realtime sống).
4. Upload video → transcode `ready` + progress realtime; file ở `/srv/frclone/uploads`.
5. Export PDF (puppeteer) + XML; guest share-link ở tab ẩn danh.
6. `docker exec <api> ffmpeg -encoders | grep -E 'libx264|aac'` đủ codec.
7. Reboot mini PC → compose tự dựng lại (`restart: unless-stopped`), job dở được BullMQ nhặt lại.

## 6. Backup (bắt buộc — thay cho migration)
Cron `pg_dump` hằng ngày ra ổ lớn (giữ synchronize:true nên không có migration để rollback):
```bash
# /etc/cron.daily/frclone-pgdump  (chmod +x)
docker exec <postgres_container> pg_dumpall -U frclone \
  | gzip > /srv/frclone/backups/pg-$(date +\%F).sql.gz
# xoá bản > 14 ngày
find /srv/frclone/backups -name 'pg-*.sql.gz' -mtime +14 -delete
```
Cân nhắc rsync `/srv/frclone/uploads` ra ổ/đích khác.

## Rehearsal cục bộ trên máy dev (làm TRƯỚC khi mang lên mini PC)
Chạy đúng stack production ngay trên máy này (Docker Desktop) sau một Caddy, tại `https://localhost` — không cần VPS/Tailscale/DNS.
```bash
cp deploy/env.prod.example deploy/.env.local     # sửa PUBLIC_URL=https://localhost + secrets
docker compose --env-file deploy/.env.local \
  -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build
```
- Mở `https://localhost` → chấp nhận cảnh báo cert **1 lần** (Caddy `tls internal`, self-signed). Test: login (cookie `Secure`), `/socket.io` WS 101, upload→transcode, export PDF.
- Kiểm nhanh không cần browser:
  ```bash
  curl -k https://localhost/api/health                          # {"status":"ok"}
  curl -k "https://localhost/socket.io/?EIO=4&transport=polling" # 0{"sid":...}
  ```
- Gỡ: thêm `down` (kèm `-v` để xoá luôn dữ liệu test) với đúng bộ `-f ... -f ...` như trên.
- Khác mini PC: dùng **named volume** cho uploads (Windows-friendly) + Caddy **self-signed** thay Let's Encrypt. Còn lại giống hệt.

## Cập nhật app sau khi đã deploy
Mỗi lần đổi code (trên mini PC hoặc rehearsal):
1. **Backup trước** (bắt buộc): chạy `pg_dump` như mục 6 — `synchronize:true` sẽ tự đổi schema theo entity mới khi api khởi động lại, không có migration để rollback.
2. `git pull`
3. Rebuild + restart **chỉ service đổi** (postgres/redis/uploads giữ nguyên nhờ volume). Phương án B thêm 2 flag `-f`/`--env-file .env` như mục B.4:
   ```bash
   docker compose --env-file .env -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build api   # đổi code api
   docker compose --env-file .env -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build web   # đổi code web
   ```
   Đổi cả hai / đổi `packages/shared` / đổi `PUBLIC_URL` → build lại **cả hai**.
4. **Đổi domain/PUBLIC_URL ⇒ PHẢI rebuild web** (NEXT_PUBLIC_* bake lúc build).
5. Verify lại: `curl /api/health`, socket.io handshake, thử 1 luồng thật.
- Rollback: `git checkout <commit-cũ> && ... up -d --build`; nếu schema đã đổi phá dữ liệu, restore từ `pg_dump`.

## Lưu ý
- Đổi `PUBLIC_URL`/domain ⇒ **rebuild image web** (NEXT_PUBLIC_* bake lúc build).
- Cả web và api PHẢI cùng origin (cookie sameSite=lax + CORS 1-origin). Tunnel đảm bảo điều này nhờ ingress định tuyến theo path trên MỘT hostname.
- Route realtime là `/socket.io/*` (KHÔNG phải `/collaboration`) — xem `deploy/cloudflared/config.yml.example` (B) hoặc `deploy/Caddyfile` (A).
- `synchronize:true` + không migration ⇒ **backup `pg_dump` trước mỗi update** (thay đổi entity phá huỷ có thể mất dữ liệu khi restart).
