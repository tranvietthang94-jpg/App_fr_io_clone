# Deploy runbook — Phương án A (mini PC + VPS + Tailscale)

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

## Lưu ý
- Đổi `PUBLIC_URL`/domain ⇒ **rebuild image web** (NEXT_PUBLIC_* bake lúc build).
- Cả web và api PHẢI cùng origin (cookie sameSite=lax + CORS 1-origin).
- Caddy route `/socket.io/*` (KHÔNG phải `/collaboration`).
