# Design System Master File — FrameReview (App_fr.io_01)

> **LOGIC:** Khi làm 1 trang cụ thể, kiểm tra `design-system/pages/<page>.md` trước.
> Nếu file đó tồn tại, quy tắc của nó **override** file Master này. Nếu không, dùng Master.
>
> File này là bản **đã tổng hợp/hiệu đính thủ công** từ output thô của skill
> `ui-ux-pro-max` (xem `design-system/framereview/` để đọc nguyên văn các lần chạy gốc).
> Lý do cần hiệu đính: generator dùng BM25 độc lập cho từng mục (pattern/style/color/typography),
> nên 1 lần gọi có thể trộn nhầm hướng landing-page marketing cho 1 app nội bộ, hoặc thiếu token
> ngữ nghĩa (card/muted/success/warning) mà UI thật sự cần. Mọi giá trị hex dưới đây đều lấy
> nguyên từ output thật của tool (không tự bịa) — chỉ khác là được **chọn lọc và ghép từ nhiều
> lần chạy** thay vì dùng máy móc 1 lần chạy duy nhất.

---

**Project:** R.Frame (Frame.io clone — video review & collaboration)
**Category:** Remote Work/Collaboration Tool (chức năng khớp nhất) + Dark Mode OLED (style bắt buộc theo quyết định giữ dark-only)
**Theme:** Dark-only, không có light mode / theme toggle (quyết định đã chốt 2026-07-14)
**Generated/curated:** 2026-07-14, từ 3 lần chạy `--design-system` + 3 lần tra `--domain color` của `.claude/skills/ui-ux-pro-max/scripts/search.py`

---

## Color Palette

### Interactive / brand (nguồn: query "developer tool dark dashboard blue accent professional video review annotation timeline collaboration", `design-system/framereview/MASTER.md` lần chạy 16:28:37)

| Role | Hex | CSS Variable | Ghi chú |
|------|-----|--------------|---------|
| Accent / Primary interactive | `#2563EB` | `--color-accent` | Giữ trong họ xanh dương gần với `accent.blue #4a9eff` hiện tại của app — tránh rebrand toàn bộ không cần thiết. Dùng cho nút primary, link, focus ring. |
| Destructive | `#DC2626` | `--color-destructive` | Xóa/nguy hiểm — gần `accent.red #ef4444` hiện có. |
| On Accent / On Destructive | `#FFFFFF` | `--color-on-accent` | |

**Cân nhắc đã bỏ qua:** tool cũng trả về `Primary #EC4899` (hồng) + `Secondary #DB2777` cho hướng "video pink on dark". Không chọn vì đây là tông thiên về app tiêu dùng/mạng xã hội (Short Video Editor), không hợp với công cụ review B2B chuyên nghiệp — và để giữ liên tục thương hiệu xanh dương đã dùng. Nếu sau này muốn hướng bold/trẻ hơn, có thể xem lại `design-system/framereview/MASTER.md`.

### Nền / bề mặt (nguồn: hội tụ độc lập từ 3 lần `--domain color` — Financial Dashboard, Smart Home/IoT Dashboard, RPA/Automation Dashboard, Developer Tool/IDE — cả 4 đều ra cùng 1 thang màu, độ tin cậy cao)

| Role | Hex | CSS Variable | Ghi chú |
|------|-----|--------------|---------|
| Background (app shell) | `#0B0F1A` (~`#0F172A`) | `--bg-primary` | So với `#1a1a1a` hiện tại: xanh đen thay vì xám đen thuần, đúng "professional dashboard" hơn "generic dark UI". |
| Surface / Card | `#1B2336` | `--bg-secondary` | Thay `#2a2a2a`. |
| Surface elevated / hover | `#272F42` | `--bg-tertiary` | Thay `#3a3a3a`. |
| Foreground / text primary | `#F8FAFC` | `--text-primary` | Gần trắng thay vì `#ffffff` thuần — giảm chói, đúng khuyến nghị Dark Mode OLED (tránh trắng/đen tuyệt đối). |
| Text secondary | `#94A3B8` | `--text-secondary` | Thay `#a0a0a0`. |
| Border | `#334155` (viền rõ) / `rgba(255,255,255,0.08)` (viền mờ, tách khối) | `--border-color` | Dùng `#334155` cho border có chức năng (input, card), `rgba(255,255,255,.08)` cho phân tách nhẹ (divider). |

### Trạng thái / semantic (nguồn: RPA/Automation Dashboard — "running green + failed red + queued amber", khớp với 4 review-status hiện có của app: in-review/approved/needs-review/rejected)

| Role | Hex | Ghi chú |
|------|-----|---------|
| Success / Approved | `#22C55E` | Thay `accent.green #4ade80` — đậm hơn 1 chút, hợp nền tối hơn. |
| Warning / Needs review | `#F59E0B` | Gần `accent.yellow #fbbf24` hiện có, giữ nguyên tinh thần. |
| Destructive / Rejected | `#DC2626` | (trùng bảng trên) |
| Info / In review | `#2563EB` | Dùng lại accent chính. |

**Giữ nguyên không đổi:** `accent.purple #a855f7` (dùng cho @mention/reaction trong CommentPanel) — không có tín hiệu nào từ skill gợi ý thay, không đổi để giảm rủi ro.

---

## Typography

- **Font:** Inter (giữ nguyên — trùng khớp với font hiện tại của app, không cần đổi). Nguồn: mood "dark, cinematic, technical, precision, clean, premium, developer, professional, high-end utility" — best for "Developer tools, fintech/trading, AI dashboards, streaming platforms, high-end productivity apps" — khớp chính xác với Frame.io clone.
- **Mono:** giữ JetBrains Mono hiện có (không nằm trong phạm vi gợi ý của tool, không có lý do đổi).
- Weight range mở rộng: 300/400/500/600/700 (hiện tại chỉ có 400/500/600/700 — thêm 300 cho text phụ/mô tả nếu cần).

---

## Spacing / Shadow / Radius

Giữ nguyên spacing scale + border-radius hiện tại của `tailwind.config.ts` (skill không đưa ra lý do đủ mạnh để đổi, và đổi spacing ảnh hưởng toàn app, rủi ro cao hơn lợi ích). Cập nhật box-shadow theo hướng "Improved shadows (softer than flat, clearer than neumorphism)" của style *Soft UI Evolution* — áp dụng khi làm Phase 2 (`ui/Card.tsx`, `ui/Dialog.tsx`).

---

## Style Guidelines

**Style chính:** Soft UI Evolution (khớp nhất với category "Remote Work/Collaboration Tool") — nhưng triển khai theo bảng màu **Dark Mode (OLED)** vì app dark-only.

**Key Effects:** shadow mềm hơn flat/rõ hơn neumorphism, transition 200–300ms, focus-visible luôn hiển thị, mục tiêu WCAG AA/AAA.

**Pattern:** Tool trả về "Video-First Hero" / "Real-Time Operations Landing" — đây là pattern **trang marketing/landing page**, KHÔNG áp dụng cho các trang app nội bộ (dashboard, project, video review workspace) vì app không có landing page công khai. Bỏ qua mục Pattern cho mục đích redesign nội bộ; layout cụ thể từng trang định nghĩa riêng trong kế hoạch từng Phase (xem `design-system/pages/`).

---

## Anti-Patterns (không dùng)

- Emoji làm icon — dùng SVG (đã dùng lucide-react, giữ nguyên)
- Thiếu `cursor-pointer` trên phần tử click được
- Hover đổi layout đột ngột (tránh scale transform gây shift)
- Contrast thấp — tối thiểu 4.5:1 (7:1+ cho các nhãn nhỏ theo khuyến nghị Dark Mode OLED)
- Đổi trạng thái tức thời không transition
- Focus state vô hình
- **Riêng cho dark-only:** không dùng nền đen tuyệt đối `#000000` (gây "OLED smear"/loá viền theo ghi chú của style Dark Mode OLED) — dùng `#0B0F1A` làm nền sâu nhất.

## Pre-Delivery Checklist (bỏ các mục light-mode không áp dụng)

- [ ] Không dùng emoji làm icon
- [ ] Icon nhất quán 1 bộ (lucide-react — đã dùng, giữ nguyên)
- [ ] `cursor-pointer` trên mọi phần tử click được
- [ ] Hover có transition mượt (150–300ms)
- [ ] Contrast text tối thiểu 4.5:1 trên nền tối (áp dụng số dark, không áp dụng mục "light mode 4.5:1" gốc của tool)
- [ ] Focus state hiển thị rõ khi dùng bàn phím
- [ ] `prefers-reduced-motion` được tôn trọng
- [ ] Responsive tại 375px, 768px, 1024px, 1440px
- [ ] Không có nội dung bị che bởi navbar cố định
- [ ] Không có horizontal scroll trên mobile

---

## Nguồn tham chiếu thô (không chỉnh sửa)

- `design-system/framereview/MASTER.md` — 2 lần chạy `--design-system --persist` gốc (16:28:37, 16:28:58)
- `design-system/framereview/pages/video-review.md` — override tự sinh, mang tính landing-page, KHÔNG dùng trực tiếp cho Phase 3 (xem `design-system/pages/video-review.md` là bản đã viết lại cho đúng mục đích workspace nội bộ)
