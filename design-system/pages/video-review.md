# Video Review Workspace — Page Override

> Override cho `app/(dashboard)/projects/[projectId]/videos/[videoId]/page.tsx`.
> Trạng thái: **đã triển khai (Phase 3, 2026-07-14)**. Bản guest tương đương
> `app/review/[token]/page.tsx` là gần-bản-sao của trang này — **chưa** áp dụng
> lại các thay đổi dưới đây (đó là Phase 4 trong kế hoạch, chưa thực hiện).
>
> Bản gốc do skill `ui-ux-pro-max` tự sinh (`design-system/framereview/pages/video-review.md`)
> là pattern trang marketing (Hero/CTA/testimonial) — không áp dụng được cho workspace nội bộ.
> File này là hướng dẫn thực tế đã dùng để triển khai.

## Vấn đề đã sửa

1. Layout gốc (`page.tsx:514,557,580` cũ) là 3 cột cứng: video+timeline | panel `w-96` (comments) | panel `w-96` (export) — và **2 panel này độc lập, có thể cùng mở một lúc** (ăn 768px chiều ngang). Không có breakpoint nào — dưới `lg` sẽ tràn/cắt.
2. Header của trang (nút Chia sẻ/Vẽ/Phím tắt) không wrap — phát hiện lúc kiểm tra thực tế ở 375px: các nút bị đẩy ra ngoài viewport (tọa độ x > 380px trên màn 375px), không bấm được dù không gây horizontal-scroll ở cấp document (bị component cha ẩn/cắt).

## Layout đã triển khai

- **Right panel:** gộp 2 panel độc lập thành **1 panel duy nhất điều khiển bằng `Tabs`** (2 tab: Bình luận / Xuất). Sửa luôn vấn đề "2 panel cùng mở" ở gốc, không chỉ vấn đề responsive.
- **1 breakpoint duy nhất tại `lg` (1024px)** — không chia 3 mức md/lg như bản nháp ban đầu, vì control bar của VideoPlayer cần đủ chiều ngang (play/skip-5s/frame-step/volume/speed/fullscreen), thử ở `md` (768px) side-by-side sẽ quá chật.
  - `< lg`: video+timeline full-width phía trên, panel Tabs full-width phía dưới (`h-64`, cuộn riêng).
  - `≥ lg`: side-by-side như cũ, panel `w-96` cố định bên phải.
- **Header trang:** thêm `flex-wrap` — xuống hàng thay vì đẩy nút ra ngoài màn hình. Title video dùng `truncate` + `max-w-[40vw]` trên mobile để không đẩy vỡ layout khi tên dài.
- **Toolbar `VideoPlayer`:** thêm `flex-wrap` (lưới an toàn), ẩn frame-step buttons + volume slider dưới `sm` (giữ play/skip-5s/mute/fullscreen luôn hiện — đủ cho thao tác cơ bản trên mobile), thời gian hiển thị co chữ (`text-xs sm:text-sm`).
- **`AnnotationCanvas` toolbar:** không đổi — đã nổi trên video, tự ổn ở mọi kích thước sẵn.

## Đã KHÔNG làm (khác với bản nháp ban đầu)

- Không dùng Popover để gộp nút toolbar — dùng `hidden sm:` + `flex-wrap` đơn giản hơn, không cần cài `@radix-ui/react-popover`.
- Không chia 3 tier width (md/lg) cho panel — chỉ 1 breakpoint `lg`, panel full-width khi stacked thay vì thu hẹp theo tier.

## Accessibility đã thêm

- `UserPresence.tsx`: online-count và typing-indicator giờ có `role="status" aria-live="polite"` — trước đây thuần hiển thị, không có gì cho screen reader.
- Dialog phím tắt (trigger phím `?`, bỏ qua khi đang gõ trong input/textarea/contentEditable) liệt kê Space/Arrow/Shift+Arrow/Home/End — các shortcut này đã hoạt động từ trước nhưng không ai biết nếu không đọc code.
- **Đã kiểm tra và sửa lại nhận định trong bản nháp ban đầu:** trang này (và `CommentPanel`/`AnnotationCanvas` của nó) **không dùng `AlertDialog` ở đâu cả** — xóa comment/annotation là xóa ngay không xác nhận. Không phải lỗi cần sửa trong phạm vi Phase 3 (hành vi có từ trước, không phải do redesign gây ra) — nêu lại ở đây để không ai tưởng đã "nâng cấp AlertDialog" cho trang này như dự kiến ban đầu.

## Kiểm chứng

- `apps/web/tests/e2e/video-review-responsive.spec.ts` (5 case, checked-in): không tràn ngang ở 375px, nút header nằm trong viewport ở 375px, chuyển tab ẩn/hiện đúng nội dung, side-by-side quay lại ở 1024px, dialog phím tắt mở bằng `?`.
- Ảnh chụp thực tế ở 375/768/1024/1440px — xem lịch sử phiên làm việc 2026-07-14.
- Toàn bộ 31 test trong `apps/web/tests/e2e/` (bao gồm cả các test có sẵn từ Phase 2) pass sau khi áp dụng — không phát sinh regression chức năng.
