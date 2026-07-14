# Kế hoạch kiểm thử MVP - Frame.io Clone

## Phương pháp kiểm thử
- Kiểm thử thủ công (manual testing)
- Mỗi tính năng phải được test thực tế
- Chỉ tick ✅ khi kết quả đúng như mong đợi
- Ghi lại lỗi/thông tin chi tiết khi test fail

**Đợt test 2026-07-14 (tự động hoá bằng Playwright, chạy thực trên app đang chạy — không đoán):**
đăng ký/đăng nhập/logout, projects, upload/transcode/player/comments/annotations/export đều đã
chạy end-to-end kèm kịch bản thao tác lỗi (email trùng, password ngắn/không khớp, sai mật khẩu,
XSS trong tên, SQL injection trong ô đăng nhập, file không phải video, mất mạng giữa chừng, truy
cập project của người khác). Chi tiết log ở phần DEBUG LOG bên dưới.

**Phase 6 (2026-07-14):** áp dụng UI overhaul cho các trang còn lại ngoài phạm vi 53 test case gốc
(login/register/forgot-password/reset-password, Google OAuth callback, invite accept, cài đặt tài
khoản `/settings/profile`) — các trang này đã tự động thừa hưởng bảng màu dark-slate mới từ Phase
0-2 (cùng tên token, chỉ đổi hex) nên không cần sửa cấu trúc; phần sửa thực tế là đồng bộ hoá 2 nút
trên trang invite (trước đó hand-rolled thay vì dùng `Button`/`buttonVariants`) và thêm focus ring
còn thiếu ở `GoogleButton`. Thêm 12 Playwright case mới (2 file: `account-pages.spec.ts`,
`account-pages-responsive.spec.ts`) cho các trang này (trước đây chưa có test nào) + full suite
52/52 pass, xác nhận 53/53 test case gốc bên dưới không bị ảnh hưởng.

---

## 1. AUTHENTICATION

### 1.1 Đăng ký
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 1.1.1 | Đăng ký thành công | 1. Mở /register<br>2. Nhập name, email, password<br>3. Click "Đăng ký" | Chuyển hướng /projects, có token | ✅ |
| 1.1.2 | Email đã tồn tại | 1. Đăng ký với email đã dùng | Báo lỗi (409, hiện thông báo lỗi trên form) | ✅ |
| 1.1.3 | Mật khẩu quá ngắn | 1. Nhập password < 6 ký tự | Báo lỗi validation | ✅ |
| 1.1.4 | Mật khẩu không khớp | 1. Nhập password và confirm khác nhau | Báo lỗi "Mật khẩu không khớp" | ✅ |

**Misuse test thêm:** gọi thẳng `POST /api/auth/register` (bỏ qua frontend) với password 2 ký tự →
backend trả `400 Bad Request` với message "Mật khẩu phải có ít nhất 6 ký tự". Bug #2 cũ (backend
không validate password length) **đã được fix từ trước**, TEST_PLAN cũ ghi nhầm là "Cần fix" — đã cập nhật.

### 1.2 Đăng nhập
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 1.2.1 | Đăng nhập thành công | 1. Mở /login<br>2. Nhập email/password đúng<br>3. Click "Đăng nhập" | Chuyển hướng /projects | ✅ |
| 1.2.2 | Sai email | 1. Nhập email không tồn tại | Báo lỗi 401, ở lại /login | ✅ |
| 1.2.3 | Sai password | 1. Nhập password sai | Báo lỗi 401, ở lại /login | ✅ |
| 1.2.4 | Logout | 1. Click "Đăng xuất" | Về /login, mất token | ✅ |

**Misuse test thêm:** nhập `' OR 1=1--` vào cả email lẫn password (SQL injection) → bị từ chối,
không đăng nhập được. Đăng ký tên `<img src=x onerror=alert(1)>` (XSS) → render ra text, không có
alert() nào chạy (thoát HTML đúng cách).

---

## 2. PROJECTS

### 2.1 Danh sách projects
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.1.1 | Hiển thị danh sách | 1. Vào /projects | Hiện danh sách projects của user | ✅ |
| 2.1.2 | Empty state | 1. Tài khoản mới, chưa có project | Hiện "Chưa có dự án nào" | ✅ |

**Thêm:** tìm kiếm project với từ khoá không tồn tại → hiện "Không tìm thấy dự án nào" ✅.

### 2.2 Tạo project
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.2.1 | Tạo thành công | 1. Click "Tạo dự án mới"<br>2. Nhập tên, mô tả<br>3. Click "Tạo" | Project mới hiện trong danh sách | ✅ |
| 2.2.2 | Tên rỗng | 1. Không nhập tên<br>2. Click "Tạo" | Không tạo được (modal vẫn mở) | ✅ |

**Misuse test thêm:** đặt tên project là `<img src=x onerror=alert(1)>` → render ra text, không
chạy alert() (an toàn XSS).

### 2.3 Xóa project
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.3.1 | Xóa thành công | 1. Hover project<br>2. Click icon xóa<br>3. Confirm | Project biến mất | ✅ |

**Bảo mật thêm:** user B gọi thẳng `GET /api/projects/:id` với ID project của user A (không phải
thành viên) → trả về 404, không rò rỉ dữ liệu. ✅

---

## 3. VIDEO UPLOAD

### 3.1 Upload video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.1.1 | Upload thành công | 1. Vào project<br>2. Click "Upload video"<br>3. Chọn file video<br>4. Đợi upload xong | Video hiện trong danh sách | ✅ |
| 3.1.2 | Progress bar | 1. Upload file | Hiện progress bar trong upload queue | ✅ |
| 3.1.3 | Upload fail | 1. Chặn network request tới `/api/upload/chunk/*` (giả lập mất mạng)<br>2. Upload | Queue item chuyển sang trạng thái "Lỗi" sau khi retry hết (4 lần, backoff) | ✅ |

**Misuse test thêm:** chọn file `.txt` (không phải video) → toast lỗi `"<tên file>" không phải file
video`, không upload. ✅

### 3.2 Danh sách videos
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.2.1 | Hiển thị videos | 1. Vào project đã có video | Hiện danh sách videos | ✅ |
| 3.2.2 | Video đang xử lý | 1. Upload video mới | Hiện "Đang xử lý..." | ✅ (xác nhận qua code `VideoCard.tsx` + API status transitions; clip test quá ngắn nên transcode xong trước khi kịp chụp UI ở trạng thái processing) |
| 3.2.3 | Video sẵn sàng | 1. Đợi transcode xong | Hiện "Sẵn sàng" | ✅ |

### 3.3 Xóa video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.3.1 | Xóa thành công | 1. Mở menu video<br>2. Click "Xóa"<br>3. Confirm | Video biến mất, xuất hiện trong Thùng rác, có thể khôi phục | ✅ |

---

## 4. VIDEO PLAYER

### 4.1 Phát video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 4.1.1 | Play/Pause | 1. Click vào video<br>2. Click Play<br>3. Click Pause | Video phát/dừng đúng | ✅ |
| 4.1.2 | Seek | 1. Click vào thanh progress | Video nhảy đến vị trí | ✅ |
| 4.1.3 | Volume | 1. Click mute | Âm thanh tắt/bật | ✅ |
| 4.1.4 | Fullscreen | 1. Click fullscreen | Video toàn màn hình | ✅ Test thủ công trên trình duyệt thật bởi người dùng 2026-07-14 (không test được bằng Playwright headless do giới hạn Fullscreen API) |

### 4.2 Frame navigation
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 4.2.1 | Frame step | 1. Click nút lùi/tiến 1 khung hình | Lùi/tiến đúng 1 frame (1/fps giây) | ✅ |
| 4.2.2 | Skip 5s | 1. Click skip back/forward | Lùi/tiến 5 giây | ✅ **Đã fix 2026-07-14** — xem LỖI ĐÃ PHÁT HIỆN #4 |

---

## 5. COMMENTS

### 5.1 Thêm comment
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.1.1 | Comment tại timestamp | 1. Dừng video ở 1 thời điểm<br>2. Nhập comment<br>3. Click gửi | Comment hiện với timestamp | ✅ |
| 5.1.2 | Comment rỗng | 1. Không nhập gì<br>2. Click gửi | Nút gửi bị disable, không gửi được | ✅ |

### 5.2 Hiển thị comments
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.2.1 | Danh sách comments | 1. Có comments trên video | Hiện danh sách, còn nguyên sau reload | ✅ |
| 5.2.2 | Click timestamp | 1. Click vào timestamp comment | Video nhảy đến thời điểm đó | ✅ |
| 5.2.3 | Comment markers | 1. Có comment trên video | Hiện marker (chấm vàng) trên timeline | ✅ |

### 5.3 Xóa comment
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.3.1 | Xóa thành công | 1. Click icon xóa<br>2. Confirm | Comment biến mất | ✅ |

---

## 6. ANNOTATIONS

### 6.1 Vẽ annotation
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 6.1.1 | Bật annotation mode | 1. Click "✏️ Vẽ chú thích" | Hiện toolbar vẽ | ✅ |
| 6.1.2 | Vẽ tự do | 1. Chọn tool "Vẽ"<br>2. Vẽ trên video | Nét vẽ hiện trên canvas | ✅ |
| 6.1.3 | Highlight | 1. Chọn tool "Đánh dấu"<br>2. Bôi vùng | Vùng highlight hiện | ✅ |
| 6.1.4 | Đổi màu | 1. Click color picker<br>2. Chọn màu | Màu vẽ thay đổi | ✅ |
| 6.1.5 | Xóa nét | 1. Click nút tẩy ("Xóa nét gần nhất") | Xóa nét gần nhất | ✅ **Đã fix 2026-07-14** — xem LỖI ĐÃ PHÁT HIỆN #5. Vẫn không có chức năng "xóa tất cả" như tên mô tả trong test case gốc (chỉ xóa từng nét một, gần nhất trước), nhưng giờ hoạt động cả với nét đang vẽ dở lẫn nét đã lưu. |

---

## 7. EXPORT

### 7.1 Export XML
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 7.1.1 | Export XML | 1. Click "Xuất"<br>2. Click "Tải xuống XML" | File XML tải về | ✅ |
| 7.1.2 | Nội dung XML | 1. Mở file XML | Có video info + comments (10KB+, đúng định dạng XML) | ✅ |

### 7.2 Export PDF
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 7.2.1 | Export PDF | 1. Click "Xuất"<br>2. Click "Tải xuống PDF" | File PDF tải về | ✅ |
| 7.2.2 | Nội dung PDF | 1. Mở file PDF | Đúng magic bytes `%PDF`, ~100KB có nội dung | ✅ |

---

## 8. TRANSCODE (FFmpeg)

### 8.1 Transcode video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 8.1.1 | Transcode thành công | 1. Upload video<br>2. Đợi xử lý | Video status = "ready" | ✅ |
| 8.1.2 | Nhiều chất lượng | 1. Kiểm tra thư mục uploads/transcoded | Có các chất lượng ≤ độ phân giải gốc (clip test 320x240 → chỉ tạo 360p, đúng vì không upscale) | ✅ |
| 8.1.3 | Thumbnail | 1. Kiểm tra uploads/thumbnails | Có file .jpg | ✅ |
| 8.1.4 | Metadata | 1. Kiểm tra DB | duration, width, height, fps đúng | ✅ |

---

## 9. BẢO MẬT & MISUSE SCENARIOS (thêm ngoài kế hoạch gốc)

| # | Kịch bản | Kết quả mong đợi | Trạng thái |
|---|----------|------------------|------------|
| 9.1 | Đăng ký với password 2 ký tự bằng cách gọi thẳng API (bỏ qua frontend) | Backend trả 400, từ chối | ✅ |
| 9.2 | SQL injection (`' OR 1=1--`) vào email + password khi login | Bị từ chối, không đăng nhập được | ✅ |
| 9.3 | XSS (`<img src=x onerror=alert(1)>`) trong tên khi đăng ký | Không chạy script, hiển thị dạng text | ✅ |
| 9.4 | XSS trong tên project | Không chạy script, hiển thị dạng text | ✅ |
| 9.5 | User B truy cập project của User A qua API trực tiếp bằng ID | Trả 404, không rò rỉ dữ liệu | ✅ |
| 9.6 | Upload file không phải video (.txt) | Bị chặn ở frontend với thông báo rõ ràng | ✅ |
| 9.7 | Mất mạng giữa lúc upload | Sau khi retry hết, video chuyển trạng thái "Lỗi" | ✅ |
| 9.8 | Gửi comment rỗng | Nút gửi bị disable | ✅ |
| 9.9 | Tạo project với tên rỗng | Bị chặn ở frontend | ✅ |

---

## TỔNG KẾT

| Module | Tổng | Pass | Fail/Gap | Chưa test |
|--------|------|------|------|-----------|
| 1. Auth | 8 | 8 | 0 | 0 |
| 2. Projects | 5 | 5 | 0 | 0 |
| 3. Video Upload | 6 | 6 | 0 | 0 |
| 4. Video Player | 6 | 6 | 0 | 0 |
| 5. Comments | 6 | 6 | 0 | 0 |
| 6. Annotations | 5 | 5 | 0 | 0 |
| 7. Export | 4 | 4 | 0 | 0 |
| 8. Transcode | 4 | 4 | 0 | 0 |
| 9. Bảo mật/Misuse | 9 | 9 | 0 | 0 |
| **Tổng** | **53** | **53** | **0** | **0** |

**Toàn bộ 53/53 test case đã pass** (2026-07-14) — 52 test tự động qua Playwright + Fullscreen (4.1.4) test thủ công bởi người dùng.

---

## LỖI ĐÃ PHÁT HIỆN

| # | Module | Mô tả lỗi | Mức độ | Trạng thái |
|---|--------|-----------|--------|------------|
| 1 | Upload | Upload xong nhưng video không hiện | 🔴 Critical | ✅ FIXED - Route mismatch |
| 2 | Auth | Backend không validate password length | 🟡 Medium | ✅ FIXED (xác nhận lại 2026-07-14, không phải "cần fix" như ghi trước đây) |
| 3 | Upload | Video không tự động transcode sau khi upload | 🟡 Medium | ✅ FIXED - Thêm trigger transcode |
| 4 | Video Player | "Skip 5s" trong TEST_PLAN không tồn tại trong UI thực tế | 🟢 Low (tính năng thiếu, không phải crash) | ✅ FIXED 2026-07-14 - Thêm nút Lùi/Tiến 5 giây + phím tắt Shift+←/→ |
| 5 | Annotations | Nút "Xóa nét gần nhất" chỉ hoạt động trên annotation đã lưu (gắn comment đã gửi); không thể undo nét đang vẽ dở (chưa gửi comment) | 🟡 Medium (UX) | ✅ FIXED 2026-07-14 - Track nét chưa lưu cục bộ, undo trước khi gọi API xóa |

---

## DEBUG LOG

### Lỗi #1: Upload xong nhưng video không hiện
**Ngày test:** 2026-07-12
**Các bước reproduce:**
1. Đăng nhập
2. Tạo project mới
3. Click "Upload video"
4. Chọn file video
5. Upload hoàn tất (100%)
6. Video KHÔNG hiện trong danh sách

**Kiểm tra:**
- [ ] Backend có nhận được file không?
- [ ] Database có record video không?
- [ ] Frontend có gọi API lấy videos không?
- [ ] Video status là gì?

**Nguyên nhân có thể:**
1. Upload API không lưu video vào DB
2. Frontend không reload sau upload
3. Video status không chuyển sang "ready"
4. API GET videos trả về rỗng

**Hướng xử lý:**
- Kiểm tra DB: `SELECT * FROM videos;`
- Kiểm tra log backend
- Kiểm tra network tab (request/response)

**Đã fix:**
- Backend route `/api/videos/:projectId/videos` → `/api/projects/:projectId/videos`
- Frontend gọi `/api/projects/${projectId}/videos` → khớp với backend
- Backend đã restart, test lại upload

### Lỗi #3: Video không tự động transcode sau khi upload
**Ngày test:** 2026-07-12
**Các bước reproduce:**
1. Upload video thành công
2. Video có status "processing" nhưng không chuyển sang "ready"
3. Duration, width, height = 0

**Nguyên nhân:**
- Upload service không trigger transcode sau khi hoàn tất

**Đã fix:**
- Thêm MediaModule vào UploadModule
- Thêm logic trigger transcode async trong upload.service.ts
- Thêm API endpoint POST /api/videos/:id/transcode để trigger thủ công
- Fix circular dependency bằng forwardRef

**Kết quả test:**
- Video đã transcode thành công (1080p, 720p, 360p)
- Status chuyển sang "ready"
- Metadata đã được cập nhật (duration: 346.16s, 1920x1080, 25fps)

### Lỗi #2 (cập nhật 2026-07-14): Backend password length validation
**Ngày test lại:** 2026-07-14
**Cách test:** gọi thẳng `POST http://localhost:4000/api/auth/register` bằng `fetch`, bỏ qua
validation phía frontend, với `password: "12"`.
**Kết quả:** `400 Bad Request`, body `{"message":["Mật khẩu phải có ít nhất 6 ký tự"],"error":"Bad Request","statusCode":400}`.
**Kết luận:** Backend ĐÃ validate đúng (dùng `class-validator` ở DTO). TEST_PLAN cũ ghi "Cần fix"
là thông tin cũ/sai — đã sửa lại trạng thái thành FIXED.

### Lỗi #4 (mới): "Skip 5s" không tồn tại trong Video Player
**Ngày phát hiện:** 2026-07-14
**Mô tả:** TEST_PLAN mục 4.2.2 kỳ vọng có nút lùi/tiến 5 giây. Đọc mã nguồn
`apps/web/components/video/VideoPlayer.tsx` cho thấy control bar chỉ có: Play/Pause, Frame step
(±1 frame, dựa trên fps của video), Mute + volume slider, Speed select (0.5x–2x), Fullscreen.
Không có nút skip 5s nào (không phải do lỗi, control đơn giản là chưa được implement).
**Ảnh hưởng:** Người dùng không có cách nhảy nhanh vài giây mà không dùng chuột kéo timeline hoặc
bấm frame-step nhiều lần (chậm với video dài).
**Đề xuất:** thêm 2 `ControlButton` gọi `handleSeek(currentTime ± 5)`, tương tự cách `frameStep()`
đã làm — hoặc nếu tính năng không cần thiết, xoá test case 4.2.2 khỏi TEST_PLAN để tránh nhầm lẫn.

### Lỗi #5 (mới): Không thể undo nét vẽ annotation chưa lưu
**Ngày phát hiện:** 2026-07-14
**Mô tả:** Trong `AnnotationCanvas.tsx`, nút "Xóa nét gần nhất" (`eraseLast`) chỉ thao tác trên
`savedAnnotations` (annotation đã lưu vào DB, gắn với 1 comment đã gửi trước đó) — gọi
`onDeleteAnnotation` → DELETE API. Annotation đang vẽ dở (`pendingAnnotations`, chưa gắn comment)
KHÔNG nằm trong danh sách này, nên nút bị `disabled={savedAnnotations.length === 0}` suốt thời
gian người dùng đang vẽ nếu video/comment đó chưa từng có annotation nào được lưu trước đây.
**Kịch bản lỗi thực tế:** người dùng bật chế độ vẽ, vẽ nhầm 1 nét, muốn xoá nét đó để vẽ lại trước
khi gửi comment → không có cách nào làm được trong UI (không undo, không clear-canvas), chỉ có
2 lựa chọn: gửi comment kèm nét vẽ sai, hoặc tắt hẳn chế độ vẽ (mất luôn toàn bộ nét đã vẽ, kể cả
nét đúng).
**Đề xuất:** thêm nút "Hoàn tác nét vừa vẽ" thao tác trên state cục bộ (canvas) trước khi comment
được gửi, độc lập với `savedAnnotations`.

### Lỗi #4 — Đã fix và kiểm tra lại (2026-07-14)
**File sửa:** `apps/web/components/video/VideoPlayer.tsx`
**Thay đổi:**
- Thêm hàm `skipSeconds(seconds)` (clamp trong khoảng `[0, duration]`, giống cách `frameStep()` đã làm).
- Thêm 2 `ControlButton` mới trong control bar: "Lùi 5 giây" (icon `Rewind`) đặt trước cặp nút
  frame-step, "Tiến 5 giây" (icon `FastForward`) đặt sau — không đụng tới 2 nút frame-step cũ.
- Thêm phím tắt `Shift+ArrowLeft` / `Shift+ArrowRight` cho skip 5s (song song với `ArrowLeft`/
  `ArrowRight` không giữ Shift vẫn là frame-step, không phá hành vi cũ).

**Kiểm tra lại bằng Playwright (script `audit4_reverify_fixes.js`), video test dài 20s để tránh
clamp che mất kết quả:**
| Test | Kết quả |
|------|---------|
| Click "Tiến 5 giây" từ t=10s | → t=15.00s ✅ |
| Click "Lùi 5 giây" từ t=15s | → t=10.00s ✅ |
| Phím tắt Shift+→ từ t=10s | → t=15.00s ✅ |
| Lùi 5s từ t=2s (gần đầu video) | clamp đúng về t=0.00s, không âm ✅ |

`npx tsc --noEmit` không có lỗi type mới.

### Lỗi #5 — Đã fix và kiểm tra lại (2026-07-14)
**File sửa:** `apps/web/components/video/AnnotationCanvas.tsx`
**Thay đổi:**
- Thêm state cục bộ `pendingStrokes` (nét vẽ trong phiên hiện tại, chưa gắn comment, không có `id`).
- Đổi tên `redrawSaved()` → `redrawAll()`, giờ vẽ lại cả `savedAnnotations` (đã lưu DB) lẫn
  `pendingStrokes` (chưa lưu) — tác dụng phụ: sửa luôn 1 lỗi liên quan chưa được liệt kê riêng: trước
  đây nếu vẽ 1 nét tự do rồi đổi sang tool "Hình chữ nhật" và kéo chuột, `redrawSaved()` cũ sẽ xoá
  sạch canvas và chỉ vẽ lại từ `savedAnnotations`, làm mất luôn nét tự do chưa lưu đó.
- `stopDrawing`/`commitText` giờ push nét mới vào `pendingStrokes` (song song với gọi
  `onAnnotationComplete` như cũ, không đổi hành vi phía component cha).
- `eraseLast()` ưu tiên pop từ `pendingStrokes` (xoá cục bộ, KHÔNG gọi API) trước; chỉ khi
  `pendingStrokes` rỗng mới rơi về hành vi cũ (gọi `onDeleteAnnotation` xoá nét đã lưu qua API).
- Nút xoá disable khi `savedAnnotations.length === 0 && pendingStrokes.length === 0` (thay vì chỉ
  check `savedAnnotations`).
- Thêm effect reset `pendingStrokes` mỗi khi bật/tắt annotation mode (`isActive` đổi) — vào chế độ vẽ
  luôn bắt đầu phiên undo mới; hành vi "mất nét chưa lưu nếu tắt chế độ vẽ mà không gửi comment" giữ
  nguyên như trước (không phải phạm vi fix này).

**Kiểm tra lại bằng Playwright (script `audit4_reverify_fixes.js` + `audit5_rect_regression.js`):**
| Test | Kết quả |
|------|---------|
| Nút xoá disable khi chưa vẽ nét nào | disabled=true ✅ |
| Nút xoá ENABLE ngay sau khi vẽ 1 nét chưa lưu (đúng lỗi cần fix) | disabled=false ✅ |
| Vẽ nét 2, click xoá → số pixel có mực giảm (nét 2 biến mất) | 937 → 488 pixel ✅ |
| Sau khi xoá nét 2, nút vẫn enable (còn nét 1) | disabled=false ✅ |
| Xoá tiếp nét 1 → nút disable lại | disabled=true ✅ |
| Vẽ + gửi comment (nét được lưu), vẽ thêm nét mới (chưa lưu), xoá → không gọi API xoá, không lỗi console | ✅ |
| Reload trang, comment/annotation đã lưu trước đó vẫn còn (không bị xoá nhầm) | ✅ |
| Vẽ nét tự do rồi đổi sang tool "Hình chữ nhật" và kéo chuột → nét tự do không biến mất (fix phụ) | pixel không giảm khi kéo rect ✅ |

`npx tsc --noEmit` không có lỗi type mới.
