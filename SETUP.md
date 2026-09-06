# Hướng dẫn cài đặt và chạy R.Frame

## Yêu cầu hệ thống

- **Node.js**: 22.12.0 hoặc cao hơn
- **Docker Desktop**: Để chạy PostgreSQL, Redis, MinIO
- **FFmpeg**: Để xử lý video (transcode, generate thumbnail)

## Cài đặt FFmpeg

### Windows
```bash
# Sử dụng winget
winget install ffmpeg

# Hoặc sử dụng choco
choco install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install ffmpeg
```

## Các bước cài đặt

### 1. Install dependencies

```bash
npm install
```

### 2. Copy environment files

Root `.env.example` is reference-only (documents the docker-compose credentials); `apps/api` and `apps/web` each load their own `.env`:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Start Docker services

```bash
npm run docker:up
```

Lệnh này sẽ khởi chạy:
- **PostgreSQL** (port 5432) - Database
- **Redis** (port 6379) - Cache & real-time
- **MinIO** (port 9000, 9001) - Object storage

### 4. Chạy development servers

```bash
# Chạy cả frontend và backend
npm run dev

# Hoặc chạy riêng
npm run dev:web   # Frontend only (http://localhost:3000)
npm run dev:api   # Backend only (http://localhost:4000)
```

### 5. Truy cập ứng dụng

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **MinIO Console**: http://localhost:9001
  - Username: `frclone`
  - Password: `frclone123`

## Tạo tài khoản đầu tiên

1. Truy cập http://localhost:3000
2. Click "Đăng ký"
3. Nhập thông tin:
   - Họ tên: Admin
   - Email: admin@example.com
   - Mật khẩu: 123456
4. Click "Đăng ký"

## Cấu trúc thư mục

```
r-frame/
├── apps/
│   ├── web/                    # Next.js Frontend
│   │   ├── app/               # Pages (App Router)
│   │   ├── components/        # React components
│   │   └── lib/              # Utils, API client, stores
│   │
│   └── api/                    # NestJS Backend
│       └── src/
│           ├── auth/          # Authentication
│           ├── projects/      # Project management
│           ├── videos/        # Video management
│           ├── comments/      # Comments & annotations
│           ├── upload/        # File upload
│           ├── export/        # XML/PDF export
│           └── media/         # FFmpeg processing
│
├── packages/shared/            # Shared TypeScript types
├── docker/
│   └── docker-compose.yml     # Docker services
└── README.md
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/me` - Thông tin user (cần auth)

### Projects
- `GET /api/projects` - Danh sách projects
- `POST /api/projects` - Tạo project mới
- `GET /api/projects/:id` - Chi tiết project
- `PATCH /api/projects/:id` - Cập nhật project
- `DELETE /api/projects/:id` - Xóa project

### Videos
- `GET /api/projects/:projectId/videos` - Videos trong project
- `GET /api/videos/:id` - Chi tiết video
- `DELETE /api/videos/:id` - Xóa video

### Comments
- `GET /api/videos/:videoId/comments` - Danh sách comments
- `POST /api/videos/:videoId/comments` - Thêm comment
- `PATCH /api/comments/:id` - Cập nhật comment
- `DELETE /api/comments/:id` - Xóa comment

### Upload
- `POST /api/upload/init` - Khởi tạo upload
- `POST /api/upload/chunk/:uploadId/:chunkIndex` - Upload chunk
- `POST /api/upload/complete/:uploadId` - Hoàn tất upload

### Export
- `GET /api/videos/:videoId/export/xml` - Export XML
- `GET /api/videos/:videoId/export/pdf` - Export PDF (HTML)

## Xử lý sự cố

### Lỗi "Cannot find module"
Chạy lại `npm install` để cài đặt dependencies.

### Lỗi kết nối database
Kiểm tra Docker đã chạy chưa:
```bash
docker ps
```

Nếu chưa chạy:
```bash
npm run docker:up
```

### Lỗi FFmpeg not found
Cài đặt FFmpeg theo hướng dẫn ở trên.

### Port đã được sử dụng
Kiểm tra và tắt các process đang sử dụng port:
- 3000 (Frontend)
- 4000 (Backend)
- 5432 (PostgreSQL)
- 6379 (Redis)
- 9000, 9001 (MinIO)

## Deploy lên server

### Build production

```bash
# Build frontend
npm run build --workspace=web

# Build backend
npm run build --workspace=api
```

### Environment variables cho production

```env
# Database
DB_HOST=your-db-host
DB_PORT=5432
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_DATABASE=your-database

# JWT
JWT_SECRET=your-super-secret-key

# MinIO/S3
MINIO_ENDPOINT=your-minio-host
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=your-bucket-name
MINIO_USE_SSL=true
```

## Chi phí dự kiến (Viettel Cloud)

| Tài nguyên | Cấu hình | Chi phí/tháng |
|------------|----------|---------------|
| Server | 2 CPU, 4GB RAM | ~300K VND |
| Database | PostgreSQL managed | ~200K VND |
| Storage | 200GB | ~100K VND |
| **Tổng** | | **~600K VND** |

## Hỗ trợ

- Tạo issue trên GitHub
- Email: support@example.com

## License

MIT License