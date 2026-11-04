# Taskboard · Quản lý công việc nhóm

Project giữa kỳ CKA 2026: React/Vite, Express, PostgreSQL và Kubernetes kubeadm (1 control plane + 2 worker).

## Chạy local

Cần Node.js 24. PowerShell tại thư mục repository:

```powershell
npm.cmd ci
npm.cmd run admin:create -w backend
npm.cmd run dev
```

Mở http://127.0.0.1:5173. Lệnh admin:create hỏi tên/email/mật khẩu và chỉ tạo tài khoản quản trị đầu tiên; không có mật khẩu mặc định. Sau đó tạo các thành viên trong ứng dụng. Nếu đã có tài khoản, bỏ qua bước tạo admin. Trên Linux/macOS dùng npm thay npm.cmd.

## Chức năng

- Đăng nhập, đổi mật khẩu, vai trò quản trị/thành viên, khóa tài khoản.
- Tạo/sửa/xóa công việc, mô tả, phân công, hạn, ưu tiên và nhãn.
- Trạng thái Chưa làm / Đang làm / Hoàn thành; danh sách và Kanban.
- Bình luận, lịch sử thay đổi, tìm kiếm không dấu, bộ lọc, sắp xếp.
- Thống kê theo thành viên, nhận biết quá hạn và xuất CSV.

Mọi thành viên xem được dữ liệu nhóm. Người tạo, người phụ trách và admin được sửa; chỉ người tạo/admin được xóa. Quyền được kiểm tra ở backend.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run build
docker compose -p taskboard-team-test -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -p taskboard-team-test -f compose.test.yaml down
```

Local bỏ qua test PostgreSQL nếu không có TEST_DATABASE_URL; Docker và CI chạy đầy đủ trên database tạm. Không dùng database production để chạy test.

## Docker và triển khai

- [Nâng cấp v2, tạo admin và ma trận quyền](docs/V2.md)
- [Docker và Docker Hub](docs/docker.md)
- [Kubernetes](k8s/DEPLOY.md)
- [HTTPS qua Caddy](k8s/https/README.md)
- [Bàn giao nhóm](docs/HANDOFF.md)

GitHub Actions CI chạy test/build. Workflow Publish Docker Images chạy thủ công, tạo tag sha-<commit>. scripts/deploy.sh chạy trên cp để cập nhật backend trước, frontend sau; scripts/rollback.sh quay về revision trước. Đọc hướng dẫn v2 trước khi chuyển từ bản công khai v1 sang bản có đăng nhập.

SQLite local ở backend/data/tasks.db; Compose/Kubernetes dùng PostgreSQL chung. Migration giữ dữ liệu cũ, không tự chuyển SQLite sang PostgreSQL. Sao lưu PostgreSQL trước nâng cấp. Không commit .env, private key, kubeconfig hoặc backup DB.

## API

/live và /health, /api/health công khai để kiểm tra sức khỏe. Các API còn lại yêu cầu cookie phiên (ngoại trừ POST /api/auth/login). Mọi yêu cầu POST/PATCH/DELETE cần header X-Taskboard-Request: 1.

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | /api/auth/login, /api/auth/logout | Đăng nhập/đăng xuất |
| GET | /api/auth/me | Tài khoản hiện tại |
| POST | /api/auth/password | Đổi mật khẩu và thu hồi phiên |
| GET, POST | /api/users | Danh sách / tạo thành viên (admin) |
| PATCH | /api/users/:id | Vai trò / khóa tài khoản (admin) |
| GET, POST | /api/tasks | Danh sách / tạo công việc |
| GET, PATCH, DELETE | /api/tasks/:id | Chi tiết / cập nhật / xóa |
| POST | /api/tasks/:id/comments | Bình luận |

Một nhóm dùng chung dữ liệu; chưa có upload file, gửi email hoặc realtime. PostgreSQL chỉ có một replica trên cp, không phải database HA.
