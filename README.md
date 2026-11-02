# Taskboard · CKA 2026

Project giữa kỳ: web quản lý công việc, sau đó đóng gói Docker và triển khai Kubernetes 1 control plane + 2 worker.

## Chạy Docker + PostgreSQL

Đã có Dockerfile frontend/backend, Nginx và Compose dùng PostgreSQL với volume. Xem [hướng dẫn Docker, kiểm thử và push registry](docs/docker.md).

Đã xác minh Docker Desktop ngày 28/10/2026: build thành công, cả 3 container healthy, API qua Nginx hoạt động và 3/3 test đạt (bao gồm PostgreSQL). Dữ liệu giữ nguyên sau restart backend. Mở http://127.0.0.1:8080 khi stack chạy. Chế độ local bên dưới vẫn dùng SQLite riêng.

## Chạy local

Cần Node.js 24 và npm. Mở terminal tại thư mục dự án:

```powershell
npm.cmd ci
npm.cmd run dev
```

Mở http://127.0.0.1:5173. Backend: http://127.0.0.1:3000/health.
Trên macOS/Linux có thể dùng `npm` thay cho `npm.cmd`.
Frontend gọi `/api`; Vite chuyển tiếp đến backend cổng 3000.
Dừng hai tiến trình bằng Ctrl+C. Cổng 3000 và 5173 cần còn trống.

## Chức năng

- Xem, thêm công việc (1–200 ký tự), đánh dấu hoàn thành hoặc mở lại.
- Lọc tất cả/đang làm/hoàn thành và xem thống kê.
- Hiển thị trạng thái kết nối API và phiên bản giao diện v1.
- Lưu vào `backend/data/tasks.db`, giữ dữ liệu qua lần khởi động lại.
- Kiểm tra sức khỏe `/health` và `/api/health`, trả version và hostname.

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
```

Test dùng database tạm riêng; không sửa dữ liệu đang dùng. Kiểm tra tạo/cập nhật, dữ liệu sai, ID không tồn tại, lưu bền vững.
Build tạo `frontend/dist`. Dockerfile frontend build rồi dùng Nginx phục vụ và proxy `/api` đến backend. Test PostgreSQL tự bỏ qua nếu chưa cấu hình `TEST_DATABASE_URL`; stack test riêng nằm trong `compose.test.yaml`.

## API

| Method | Endpoint | Body |
|---|---|---|
| GET | `/health`, `/api/health` | — |
| GET | `/api/tasks` | — |
| POST | `/api/tasks` | `{"title":"Chuẩn bị demo"}` |
| PATCH | `/api/tasks/:id` | `{"completed":true}` |

Backend dùng biến môi trường `PORT` (mặc định 3000), `DB_PATH` và `APP_VERSION` (mặc định v1). Nếu đổi PORT, cập nhật proxy trong `frontend/vite.config.js`.
Frontend dùng `VITE_APP_VERSION` khi khởi động/build để thay nhãn phiên bản.

## Giới hạn và bước tiếp theo

SQLite chỉ dành cho local một backend. Compose dùng PostgreSQL chung; dữ liệu SQLite không tự chuyển sang PostgreSQL. Chưa có đăng nhập/phân quyền; đây là ứng dụng demo.
Backend nghe loopback khi chạy local; Dockerfile đặt HOST=0.0.0.0 cho container. Production bắt buộc DB_DRIVER=postgres.

Xem [bàn giao cho nhóm](docs/HANDOFF.md), [triển khai Kubernetes](k8s/DEPLOY.md) và [HTTPS](k8s/https/README.md).
