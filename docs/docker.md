# Docker + PostgreSQL

## Chạy ứng dụng

Cần Docker Engine chạy Linux containers và Docker Compose v2. Trên Windows có thể dùng Docker Desktop. Kiểm tra `docker version` và `docker compose version`.

Tại thư mục gốc, sao chép `.env.example` sang `.env` nếu chưa có. Đổi `POSTGRES_PASSWORD` thành mật khẩu riêng; không commit `.env`.

```powershell
Copy-Item .env.example .env
# Sửa POSTGRES_PASSWORD trong .env trước khi chạy các lệnh sau.
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

Mở http://127.0.0.1:8080. Luồng: trình duyệt → Nginx → backend:3000 → db:5432. Backend và database không mở cổng ra máy host. Compose đợi database khỏe trước khi khởi động backend, rồi frontend.

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
docker compose logs --tail 50 backend
```

Thêm task, `docker compose restart backend`, làm mới trang để xác nhận dữ liệu còn nguyên. `docker compose down` giữ volume; không thêm `-v` nếu muốn giữ dữ liệu. Đổi mật khẩu `.env` không tự đổi mật khẩu database đã khởi tạo trong volume.

## Kiểm thử PostgreSQL riêng biệt

Stack test dùng PostgreSQL tạm riêng, không cần `.env`, không đụng dữ liệu ứng dụng:

```powershell
docker compose -p taskboard-test -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -p taskboard-test -f compose.test.yaml down
```

Test tạo hai API server cùng database: tạo qua server 1, đọc/cập nhật qua server 2, đọc lại qua server 1 và kết nối mới để kiểm tra dữ liệu. Schema test được dọn khi kết thúc. Khi dùng `TEST_DATABASE_URL` thủ công, chọn database test riêng và tài khoản có quyền tạo schema.

## Registry và phiên bản

Sửa `.env`: `IMAGE_PREFIX=<ten-tai-khoan-Docker-Hub>` và `APP_VERSION=v1`.

```powershell
docker compose build
docker login
docker compose push frontend backend
```

Images: `<tai-khoan>/frontend:v1`, `<tai-khoan>/backend:v1`; không dùng latest. Đổi `APP_VERSION=v2`, build và khởi động lại để đổi nhãn giao diện/API. Rollout/rollback chính thức sẽ demo trên Kubernetes. Chưa push tự động vì chưa chọn registry/tài khoản.

## Cấu hình backend

- `DB_DRIVER=postgres`: dùng PostgreSQL; bỏ trống dùng SQLite local.
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: kết nối database.
- `HOST`: mặc định 127.0.0.1; container đặt 0.0.0.0. `PORT`: mặc định 3000.
- `APP_VERSION`: nhãn API; Compose cũng truyền giá trị này vào build frontend.
- `/live`: tiến trình sống. `/health`, `/api/health`: kiểm tra database, trả 503 khi lỗi.
- `NODE_ENV=production` bắt buộc PostgreSQL, tránh mỗi replica vô tình dùng một SQLite riêng.

## Giới hạn và kiểm chứng còn lại

Đã xác minh ngày 28/10/2026 trên Docker Desktop: build frontend/backend v1 thành công, 3 container healthy, trang web/API qua Nginx trả 200, tạo/cập nhật task thành công, dữ liệu còn sau restart backend. Stack test đạt 3/3, bao gồm hai API dùng chung PostgreSQL; stack test đã được dọn, stack ứng dụng vẫn chạy.

`npm.cmd test` ngoài Docker vẫn bỏ qua test PostgreSQL nếu không có `TEST_DATABASE_URL`. Terminal cũ có thể chưa nhận PATH sau cài Docker; mở lại terminal hoặc gọi `& 'D:/Docker/Desktop/resources/bin/docker.exe' compose ps` trên máy này.

- SQLite local và PostgreSQL là hai kho riêng, không tự chuyển dữ liệu.
- PostgreSQL hiện một instance, chưa có HA. Kubernetes cần Secret/PVC và kế hoạch vị trí database khi tắt worker.
- Nginx dùng Service tên `backend` cùng namespace khi lên Kubernetes. Nếu thay backend container và Nginx còn giữ IP cũ, chạy `docker compose restart frontend`.
- Base images có tag phiên bản nhưng chưa pin digest; ghi lại digest khi build bản nộp.
- Ứng dụng chưa có đăng nhập/phân quyền, chỉ dùng dữ liệu demo.

Tham khảo: [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/), [node-postgres queries](https://node-postgres.com/features/queries).
