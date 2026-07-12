# Frame.io Clone - Video Review & Collaboration Platform

Một bản clone của Frame.io - nền tảng review và cộng tác video, được thiết kế cho cá nhân và team nhỏ (< 5 người) tại Việt Nam.

## 🚀 Tính năng

### MVP (2 tuần)
- ✅ **Quản lý Project**: Tạo, xóa, quản lý dự án video
- ✅ **Upload Video**: Upload video chunked, hỗ trợ file lớn
- ✅ **Transcode**: Tự động transcode video sang nhiều chất lượng
- ✅ **Video Player**: Player tùy chỉnh với frame-by-frame navigation
- ✅ **Comment System**: Bình luận chính xác theo timestamp/frame
- ✅ **Annotation**: Vẽ, highlight trên video (coming soon)
- ✅ **Export XML**: Xuất dữ liệu bình luận dạng XML
- ✅ **Export PDF**: Xuất báo cáo PDF

## 📋 Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Zustand** (state management)
- **Socket.io-client** (real-time)

### Backend
- **NestJS** (Node.js framework)
- **PostgreSQL** (database)
- **Redis** (cache & real-time)
- **MinIO** (object storage - S3 compatible)
- **FFmpeg** (video processing)
- **BullMQ** (job queue)

## 📁 Cấu trúc project

```
app-fr-io-clone/
├── apps/
│   ├── web/          # Next.js Frontend
│   └── api/          # NestJS Backend
├── packages/
│   └── shared/       # Shared types
├── docker/
│   └── docker-compose.yml
└── package.json
```

## 🛠️ Cài đặt & Chạy locally

### Yêu cầu
- Node.js 18+
- Docker Desktop
- FFmpeg (cho video processing)

### Các bước cài đặt

1. **Install dependencies**
```bash
npm install
```

2. **Copy environment file**
```bash
cp .env.example .env
```

3. **Start Docker services** (PostgreSQL, Redis, MinIO)
```bash
npm run docker:up
```

4. **Chạy development servers**
```bash
# Chạy cả frontend và backend
npm run dev

# Hoặc chạy riêng
npm run dev:web   # Frontend only (http://localhost:3000)
npm run dev:api   # Backend only (http://localhost:4000)
```

5. **Access MinIO Console** (storage management)
- URL: http://localhost:9001
- Username: `frclone`
- Password: `frclone123`

## 📖 API Endpoints

### Auth
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/me` - Thông tin user

### Projects
- `GET /api/projects` - Danh sách projects
- `POST /api/projects` - Tạo project mới
- `GET /api/projects/:id` - Chi tiết project
- `PATCH /api/projects/:id` - Cập nhật project
- `DELETE /api/projects/:id` - Xóa project

### Videos
- `GET /api/projects/:projectId/videos` - Videos trong project
- `POST /api/projects/:projectId/videos/upload` - Upload video
- `GET /api/videos/:id` - Chi tiết video
- `GET /api/videos/:id/stream/:quality` - Stream video

### Comments
- `GET /api/videos/:videoId/comments` - Danh sách comments
- `POST /api/videos/:videoId/comments` - Thêm comment
- `PATCH /api/comments/:id` - Cập nhật comment
- `DELETE /api/comments/:id` - Xóa comment

### Export
- `GET /api/videos/:videoId/export/xml` - Export XML
- `GET /api/videos/:videoId/export/pdf` - Export PDF

## 🗄️ Database Schema

### Users
- id, email, name, avatarUrl, createdAt

### Projects
- id, name, description, ownerId, thumbnailUrl, status, createdAt, updatedAt

### Videos
- id, projectId, title, originalFilename, filePath, duration, width, height, fps, fileSize, status, createdAt

### Comments
- id, videoId, userId, parentId, content, timestamp, frameNumber, positionX, positionY, createdAt

## 💰 Chi phí dự kiến (khi lên host)

| Nhà cung cấp | Chi phí/tháng |
|--------------|---------------|
| Viettel Cloud | ~400K VND |
| FPT Cloud | ~550K VND |
| VPS giá rẻ | ~150K VND |

## 📝 Môi trường biến

Xem file `.env.example` để biết các biến cần thiết.

## 🚧 Roadmap

### Phase 1 (Current - MVP)
- [x] Project setup
- [x] Auth system
- [x] Video upload & transcode
- [x] Video player
- [x] Comment system
- [x] Export XML/PDF

### Phase 2 (Next)
- [ ] Real-time collaboration (Socket.io)
- [ ] Annotation tools (draw, highlight)
- [ ] Team management
- [ ] Email notifications
- [ ] Mobile responsive

### Phase 3 (Future)
- [ ] AI features (auto-transcription)
- [ ] Advanced workflows
- [ ] Integrations (Adobe, DaVinci)
- [ ] Custom branding

## 📄 License

MIT License - Tự do sử dụng cho cá nhân và thương mại.

## 👥 Đóng góp

Mọi đóng góp đều được chào đón! Hãy tạo issue hoặc pull request.