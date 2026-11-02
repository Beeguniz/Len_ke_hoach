# Kế hoạch nhóm — hạn nộp 19/11/2026

## Phạm vi đã chọn
Web quản lý công việc: danh sách, thêm, đánh dấu hoàn thành; React + Express.
Giai đoạn đầu chạy local bằng Node.js 24, SQLite lưu bền vững trên máy.
Đã thêm PostgreSQL adapter và Compose; cần xác minh container và test tích hợp trên máy có Docker trước khi tăng backend replica.
Không thêm đăng nhập/phân quyền ở bản demo này. Chỉ dùng dữ liệu demo.

## Phân công đề xuất (điền tên thành viên)
1. Frontend, giao diện và phiên bản v2.
2. Backend, dữ liệu và API.
3. Cloud, kubeadm, CNI và mạng.
4. Docker, registry, YAML và vận hành Kubernetes.
5. Tích hợp, README, ảnh minh chứng, báo cáo và demo.

## Mốc
- 28–30/10: chốt phạm vi, khởi tạo repository, ứng dụng local.
- 31/10–03/11: Dockerfile, database dùng chung, build/push v1.
- 04–07/11: cluster 3 node Ready.
- 08–10/11: triển khai, Service, replicas và phân bố Pod.
- 11–13/11: scale, update, rollback, tắt worker và chụp minh chứng.
- 14–16/11: README, PDF tối đa 10 trang, slide.
- 17–18/11: luyện demo 8–10 phút và kiểm tra hồ sơ.
- 19/11: nộp repository, báo cáo PDF, bài thuyết trình.

## Thông tin còn cần nhóm chốt
- Tên 5 thành viên và người phụ trách.
- Nhà cung cấp cloud, tài khoản, ngân sách.
- Tài khoản Git hosting, tên repository và người được cấp quyền.
- Registry và tên image.
