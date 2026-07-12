# Kế hoạch kiểm thử MVP - Frame.io Clone

## Phương pháp kiểm thử
- Kiểm thử thủ công (manual testing)
- Mỗi tính năng phải được test thực tế
- Chỉ tick ✅ khi kết quả đúng như mong đợi
- Ghi lại lỗi/thông tin chi tiết khi test fail

---

## 1. AUTHENTICATION

### 1.1 Đăng ký
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 1.1.1 | Đăng ký thành công | 1. Mở /register<br>2. Nhập name, email, password<br>3. Click "Đăng ký" | Chuyển hướng /projects, có token | ⬜ |
| 1.1.2 | Email đã tồn tại | 1. Đăng ký với email đã dùng | Báo lỗi "Email đã được sử dụng" | ⬜ |
| 1.1.3 | Mật khẩu quá ngắn | 1. Nhập password < 6 ký tự | Báo lỗi validation | ⬜ |
| 1.1.4 | Mật khẩu không khớp | 1. Nhập password và confirm khác nhau | Báo lỗi "Mật khẩu không khớp" | ⬜ |

### 1.2 Đăng nhập
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 1.2.1 | Đăng nhập thành công | 1. Mở /login<br>2. Nhập email/password đúng<br>3. Click "Đăng nhập" | Chuyển hướng /projects | ⬜ |
| 1.2.2 | Sai email | 1. Nhập email không tồn tại | Báo lỗi "Email hoặc mật khẩu không đúng" | ⬜ |
| 1.2.3 | Sai password | 1. Nhập password sai | Báo lỗi "Email hoặc mật khẩu không đúng" | ⬜ |
| 1.2.4 | Logout | 1. Click "Đăng xuất" | Về /login, mất token | ⬜ |

---

## 2. PROJECTS

### 2.1 Danh sách projects
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.1.1 | Hiển thị danh sách | 1. Vào /projects | Hiện danh sách projects của user | ⬜ |
| 2.1.2 | Empty state | 1. Xóa hết projects | Hiện "Chưa có dự án nào" | ⬜ |

### 2.2 Tạo project
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.2.1 | Tạo thành công | 1. Click "Tạo dự án mới"<br>2. Nhập tên, mô tả<br>3. Click "Tạo" | Project mới hiện trong danh sách | ⬜ |
| 2.2.2 | Tên rỗng | 1. Không nhập tên<br>2. Click "Tạo" | Không tạo được | ⬜ |

### 2.3 Xóa project
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 2.3.1 | Xóa thành công | 1. Hover project<br>2. Click icon xóa<br>3. Confirm | Project biến mất | ⬜ |

---

## 3. VIDEO UPLOAD

### 3.1 Upload video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.1.1 | Upload thành công | 1. Vào project<br>2. Click "Upload video"<br>3. Chọn file video<br>4. Đợi upload xong | Video hiện trong danh sách | ⬜ |
| 3.1.2 | Progress bar | 1. Upload file lớn | Hiện progress bar, % tăng dần | ⬜ |
| 3.1.3 | Upload fail | 1. Ngắt kết nối mạng<br>2. Upload | Báo lỗi "Upload thất bại" | ⬜ |

### 3.2 Danh sách videos
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.2.1 | Hiển thị videos | 1. Vào project đã có video | Hiện danh sách videos | ⬜ |
| 3.2.2 | Video đang xử lý | 1. Upload video mới | Hiện "Đang xử lý..." | ⬜ |
| 3.2.3 | Video sẵn sàng | 1. Đợi transcode xong | Hiện "Sẵn sàng" | ⬜ |

### 3.3 Xóa video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 3.3.1 | Xóa thành công | 1. Hover video<br>2. Click icon xóa<br>3. Confirm | Video biến mất | ⬜ |

---

## 4. VIDEO PLAYER

### 4.1 Phát video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 4.1.1 | Play/Pause | 1. Click vào video<br>2. Click Play<br>3. Click Pause | Video phát/dừng đúng | ⬜ |
| 4.1.2 | Seek | 1. Kéo thanh progress | Video nhảy đến vị trí | ⬜ |
| 4.1.3 | Volume | 1. Click mute<br>2. Kéo volume | Âm thanh tắt/bật | ⬜ |
| 4.1.4 | Fullscreen | 1. Click fullscreen | Video toàn màn hình | ⬜ |

### 4.2 Frame navigation
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 4.2.1 | Frame step | 1. Click ←F / F→ | Lùi/tiến 1 frame | ⬜ |
| 4.2.2 | Skip 5s | 1. Click skip back/forward | Lùi/tiến 5 giây | ⬜ |

---

## 5. COMMENTS

### 5.1 Thêm comment
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.1.1 | Comment tại timestamp | 1. Dừng video ở 1 thời điểm<br>2. Nhập comment<br>3. Click gửi | Comment hiện với timestamp | ⬜ |
| 5.1.2 | Comment rỗng | 1. Không nhập gì<br>2. Click gửi | Không gửi được | ⬜ |

### 5.2 Hiển thị comments
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.2.1 | Danh sách comments | 1. Có comments trên video | Hiện danh sách theo timestamp | ⬜ |
| 5.2.2 | Click timestamp | 1. Click vào timestamp comment | Video nhảy đến thời điểm đó | ⬜ |
| 5.2.3 | Comment markers | 1. Di chuyển timeline | Hiện marker tại vị trí comment | ⬜ |

### 5.3 Xóa comment
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 5.3.1 | Xóa thành công | 1. Click icon xóa<br>2. Confirm | Comment biến mất | ⬜ |

---

## 6. ANNOTATIONS

### 6.1 Vẽ annotation
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 6.1.1 | Bật annotation mode | 1. Click "✏️ Vẽ" | Hiện toolbar vẽ | ⬜ |
| 6.1.2 | Vẽ tự do | 1. Chọn tool "Vẽ"<br>2. Vẽ trên video | Nét vẽ hiện | ⬜ |
| 6.1.3 | Highlight | 1. Chọn tool "Highlight"<br>2. Bôi vùng | Vùng highlight hiện | ⬜ |
| 6.1.4 | Đổi màu | 1. Click color picker<br>2. Chọn màu | Màu vẽ thay đổi | ⬜ |
| 6.1.5 | Xóa tất cả | 1. Click eraser | Xóa hết annotations | ⬜ |

---

## 7. EXPORT

### 7.1 Export XML
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 7.1.1 | Export XML | 1. Click "Xuất"<br>2. Click "Tải xuống XML" | File XML tải về | ⬜ |
| 7.1.2 | Nội dung XML | 1. Mở file XML | Có video info + comments | ⬜ |

### 7.2 Export PDF
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 7.2.1 | Export PDF | 1. Click "Xuất"<br>2. Click "Tải xuống PDF" | File PDF tải về | ⬜ |
| 7.2.2 | Nội dung PDF | 1. Mở file PDF | Có video info + comments | ⬜ |

---

## 8. TRANSCODE (FFmpeg)

### 8.1 Transcode video
| # | Test Case | Các bước | Kết quả mong đợi | Trạng thái |
|---|-----------|----------|------------------|------------|
| 8.1.1 | Transcode thành công | 1. Upload video<br>2. Đợi xử lý | Video status = "ready" | ⬜ |
| 8.1.2 | Nhiều chất lượng | 1. Kiểm tra thư mục uploads/transcoded | Có 360p, 720p, 1080p | ⬜ |
| 8.1.3 | Thumbnail | 1. Kiểm tra uploads/thumbnails | Có file .jpg | ⬜ |
| 8.1.4 | Metadata | 1. Kiểm tra DB | duration, width, height, fps đúng | ⬜ |

---

## TỔNG KẾT

| Module | Tổng | Pass | Fail | Chưa test |
|--------|------|------|------|-----------|
| 1. Auth | 8 | 5 | 1 | 2 |
| 2. Projects | 5 | 3 | 0 | 2 |
| 3. Video Upload | 6 | 2 | 0 | 4 |
| 4. Video Player | 6 | 0 | 0 | 6 |
| 5. Comments | 6 | 0 | 0 | 6 |
| 6. Annotations | 5 | 0 | 0 | 5 |
| 7. Export | 4 | 0 | 0 | 4 |
| 8. Transcode | 4 | 4 | 0 | 0 |
| **Tổng** | **44** | **14** | **1** | **29** |

---

## LỖI ĐÃ PHÁT HIỆN

| # | Module | Mô tả lỗi | Mức độ | Trạng thái |
|---|--------|-----------|--------|------------|
| 1 | Upload | Upload xong nhưng video không hiện | 🔴 Critical | ✅ FIXED - Route mismatch |
| 2 | Auth | Backend không validate password length | 🟡 Medium | 🔍 Cần fix |
| 3 | Upload | Video không tự động transcode sau khi upload | 🟡 Medium | ✅ FIXED - Thêm trigger transcode |

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
