# Design System Master File — R.Frame (App_fr.io_01)

> **LOGIC:** Khi làm 1 trang cụ thể, kiểm tra `design-system/pages/<page>.md` trước.
> Nếu file đó tồn tại, quy tắc của nó **override** file Master này. Nếu không, dùng Master.
>
> Trạng thái: **đã triển khai — hướng "filmic workspace" (2026-11-12)**, thay cho bản
> 2026-07-14 (màu xanh lá/xanh dương `#2563EB` trong bản cũ chưa bao giờ được áp dụng; app
> chạy với `#10B981`). Giá trị dưới đây khớp `apps/web/tailwind.config.ts` — khi sửa token,
> sửa cả hai nơi. Nguồn tham chiếu thô của lần tạo ban đầu: `design-system/framereview/`.
>
> Spec thiết kế: `docs/superpowers/specs/2026-11-12-ui-filmic-workspace-design.md`
> (mục "Calls made by the designer" là bản chốt cuối).

**Project:** R.Frame (Frame.io clone — video review & collaboration)
**Theme:** Dark-only, không có light mode / theme toggle.
**Fonts:** Inter (UI), JetBrains Mono (timecode, số liệu).

---

## Màu — tokens (`tailwind.config.ts`)

### Primary = đỏ của nút đăng nhập

| Token | Hex | Dùng cho |
|-------|-----|----------|
| `primary` | `#EF4444` | nút chính, link, mục đang chọn, focus ring, marker timeline |
| `primary.hover` | `#DC2626` | hover nút chính |
| `primary.active` | `#B91C1C` | nhấn nút chính |
| `primary.soft` | `rgba(239,68,68,.14)` | nền mục đang chọn, chip timecode |

**Lý do:** nút "Đăng nhập" của màn hình đăng nhập (chủ sở hữu thấy là "đỏ cam") đã là `#EF4444`.
Lấy đúng màu đó làm primary giữ các màn đăng nhập **giống từng điểm ảnh** và cho cả app một màu
nhấn duy nhất. Đánh đổi: chữ trắng trên `#EF4444` chỉ đạt **3.76:1** (dưới AA 4.5:1 cho chữ
nhỏ); `#DC2626` cho 4.83:1 nếu sau này muốn đạt AA.

### Semantic (theo **ý nghĩa**, không theo màu)

| Token | Hex | Dùng cho |
|-------|-----|----------|
| `success` | `#22C55E` | đã duyệt, đã xử lý, hoàn tất, thanh dung lượng bình thường |
| `warning` | `#F59E0B` | cần xem lại, sắp hết dung lượng |
| `brand` | `#10B981` | chấm "." trong R.Frame và link xanh của trang đăng nhập — không dùng cho hành động |
| `destructive.text` | `#F87171` | chữ/icon xoá, lỗi |
| `destructive.border` | `#7F1D1D` | viền nút/khung xoá |
| `destructive.hoverbg` | `rgba(127,29,29,.25)` | hover nút xoá, nền banner lỗi |
| `destructive.solid` / `.solidhover` | `#B91C1C` / `#991B1B` | **chỉ** nút xác nhận cuối của hộp thoại xoá, badge đếm |

Quy tắc chuyển đổi từ màu cũ: xanh dùng cho hành động/đang chọn/focus/link → `primary`; xanh
dùng cho đã duyệt/thành công → `success`; chấm wordmark → `brand`; đỏ xoá/lỗi → `destructive.*`.
`accent.*` đã bị xoá khỏi config.

### Nền / chữ / viền

| Token | Hex |
|-------|-----|
| `bg.primary` / `secondary` / `tertiary` / `hover` | `#0B0C10` / `#13151B` / `#1A1D24` / `#22262F` |
| `text.primary` / `secondary` / `muted` | `#F8FAFC` / `#94A3B8` / `#8493A8` |
| `border` / `border.light` | `#282D37` / `#3A404C` |

`text.muted` được nâng từ `#64748B` lên `#8493A8` vì `#64748B` chỉ đạt 3.2–4.1:1 trên các nền tối.

### Độ tương phản đã đo (WCAG, nền `bg.primary / secondary / tertiary / hover`)

| Màu chữ | primary | secondary | tertiary | hover |
|---------|---------|-----------|----------|-------|
| `text.primary` | 18.68 | 17.44 | 16.12 | 14.48 |
| `text.secondary` | 7.62 | 7.12 | 6.58 | 5.91 |
| `text.muted` | 6.26 | 5.84 | 5.40 | 4.85 |
| `primary` (chữ đỏ) | 5.19 | 4.85 | 4.48 | 4.03 |
| `success` | 8.58 | 8.01 | 7.40 | 6.65 |
| `warning` | 9.10 | 8.50 | 7.85 | 7.05 |
| `destructive.text` | 7.07 | 6.60 | 6.10 | 5.48 |

Ngoại lệ đã biết: chữ đỏ `primary` trên `bg.tertiary`/`bg.hover` (4.48 / 4.03) và chữ trắng trên
nút primary (3.76) dưới 4.5:1 — dùng cho nhãn đậm/ngắn, không dùng `primary` cho đoạn chữ nhỏ.

---

## Quy tắc "destructive theo hình thức"

Vì primary và màu xoá cùng tông đỏ, hành động nguy hiểm được phân biệt bằng **hình thức**, không
chỉ bằng sắc độ:

- `Button variant="destructive"`: nền trong suốt, chữ `destructive.text`, viền `destructive.border`,
  **luôn kèm icon** (thùng rác/cảnh báo).
- `Button variant="destructiveSolid"`: chỉ cho nút xác nhận cuối trong hộp thoại xoá.
- Mọi hành động xoá giữ hộp thoại xác nhận hiện có (`AlertDialog`, `ConfirmPermanentDelete`).
- Nút chính (`primary`) luôn đặc, `#EF4444`.

---

## Hình dạng

- **Bán kính** (scale của config): `DEFAULT` 6px cho nút, input, menu, tooltip, select; `md` 8px cho
  card, dialog, toast, panel; `full` cho chip/avatar.
- **Shadow:** menu/toast/tooltip/upload panel `0 8px 24px rgba(0,0,0,.45)`; dialog `0 16px 48px rgba(0,0,0,.55)`.
- **Cỡ nút:** `sm` 32px, `md` 36px, `lg` 40px. **Input** mặc định 36px.
- **Focus:** `focus-visible:ring-2 ring-primary` (+ `ring-offset-2 ring-offset-bg-primary`) ở mọi phần tử tương tác.
- **Chip trạng thái duyệt:** `ui/StatusChip` (`approved` success, `needs_review` warning,
  `in_review`/`neutral` chữ phụ, `rejected` destructive).

---

## App shell (`app/(dashboard)/layout.tsx`)

- **`IconRail`** (≥ `lg`): rộng 56px — Dự án, Thông báo (mở dropdown chuông hiện có), Quản trị (chỉ admin),
  Cài đặt; dưới cùng: thanh dung lượng thu gọn (tooltip hiện số) và menu "Tài khoản" (Hồ sơ, Đăng xuất,
  thanh dung lượng đầy đủ). Mỗi mục có `aria-label` + tooltip; mục đang chọn tô `primary`.
- **`ContextPanel`**: rộng 240px, thu gọn được (nút hoặc phím `[`, bỏ qua khi đang gõ trong
  input/textarea/contentEditable). Có ô tìm dự án, danh sách dự án (cuộn riêng), và khi đang trong
  một dự án: thư mục cấp 1 (`?folder=<id>`) và "Bộ lọc video". Trạng thái lưu ở
  `localStorage["rframe.panelCollapsed"]` (luôn bọc try/catch); mặc định mở, riêng trang review video mặc định thu gọn.
- **Breakpoint duy nhất: `lg` (1024px).** Dưới `lg`: thanh tab dưới (cùng các mục + menu Tài khoản) và
  nút "Mở menu" ở header mở `ContextPanel` dạng drawer (focus-trap, Esc/click nền để đóng).
- Trang khách `/review/[token]` **không có** rail/panel.
- Thư mục đang mở của trang dự án nằm trên URL (`?folder=<id>`); id không tồn tại/thuộc dự án khác quay về gốc.

---

## Màn hình đăng nhập được "ghim"

`app/(auth)/*` phải **giống từng điểm ảnh** khi token/component dùng chung đổi. Cơ chế:

1. `apps/web/tests/e2e/auth-visual.spec.ts` chụp `/login`, `/register`, `/forgot-password`,
   `/reset-password/<token>` ở 1440×900 và 375×812 (`toHaveScreenshot`, ảnh chuẩn ở
   `tests/e2e/__screenshots__/`) và kiểm tra nút đăng nhập là `rgb(239, 68, 68)`.
2. Các trang auth dùng **class tường minh** tái tạo style cũ (nút, link xanh `#10B981`, input h-11 +
   ring xanh, placeholder `#64748B`, outline/selection ở `(auth)/layout.tsx`), nên đổi `Button`/`Input`/token
   dùng chung không lan sang đó. Nút đăng ký/quên/đặt lại mật khẩu vẫn **xanh** như trước; chỉ nút đăng nhập đỏ.
3. Ảnh chuẩn phụ thuộc máy/Chrome cục bộ; đổi cố ý thì chạy lại với `--update-snapshots` và xem diff bằng mắt.

---

## Anti-Patterns (không dùng)

- Emoji làm icon — dùng SVG (lucide-react).
- Thiếu `cursor-pointer` trên phần tử click được; focus state vô hình.
- Hover đổi layout đột ngột; đổi trạng thái tức thời không transition.
- Contrast chữ nhỏ dưới 4.5:1 (xem bảng đo ở trên).
- Nền đen tuyệt đối `#000000` cho bề mặt app.
- Dùng `primary` cho nút xoá, hoặc nút xoá đặc ngoài bước xác nhận cuối.
- Gắn selector test vào class màu (`accent-*`, `bg-warning`...): dùng `role`, `aria-label` hoặc `data-*`.

## Checklist trước khi giao

- [ ] Không emoji làm icon; icon cùng một bộ (lucide-react)
- [ ] Hover có transition 150–300ms; `prefers-reduced-motion` được tôn trọng
- [ ] Focus hiển thị rõ bằng bàn phím (ring primary)
- [ ] Chữ tối thiểu 4.5:1 trên nền tối (xem ngoại lệ đã biết)
- [ ] Tên dài (80+ ký tự, có dấu) cắt bằng `truncate` + `title`, không tràn ở 375px
- [ ] Responsive tại 375px, 1024px, 1440px; không có horizontal scroll
- [ ] `auth-visual.spec.ts` xanh; `npm run lint` và toàn bộ Playwright xanh

---

## Nguồn tham chiếu thô (không chỉnh sửa)

- `design-system/framereview/` — output thô của skill `ui-ux-pro-max` lúc tạo hệ thống thiết kế ban đầu (đã lỗi thời so với bản này).
