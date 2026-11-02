# Bàn giao nhóm — 02/11/2026

## Đã thực hiện

- Taskboard React/Vite, API Express; SQLite cho local và PostgreSQL cho Docker/Kubernetes.
- Dockerfiles, Compose, kiểm thử API và PostgreSQL; image Docker Hub quyphu123/frontend và quyphu123/backend.
- Cụm Azure kubeadm: cp (172.16.0.4), worker1 (172.16.0.5), worker2 (172.16.0.6).
- Namespace midterm-app; frontend/backend 2 replica; PostgreSQL 1 replica và PVC.
- Đã thử scale backend lên 4, cập nhật frontend v2, rollback và dừng/bật worker.
- Theo kết quả gần nhất: 3 node Ready, ứng dụng trả health status ok.

## Việc cần tiếp tục: HTTPS

DNS beegun.site trỏ tới public IP cp 104.208.113.122; www là CNAME tới beegun.site.
Caddy được cấu hình trong k8s/https; image caddy:2.11.7-alpine đã được Docker xác thực với kết quả Valid configuration.
HTTPS công khai CHƯA xác nhận thành công. Lần kiểm tra gần nhất trên cp kết nối được localhost:443 nhưng TLS báo internal error. Chưa xác định nguyên nhân; cần log Caddy, kiểm tra DNS và NSG TCP 80/443.

Chạy trên SSH cp:

```bash
kubectl get nodes
kubectl -n midterm-app get deployments,pods -o wide
kubectl -n midterm-app logs deployment/caddy --tail=150
curl --max-time 10 http://172.16.0.4:30080/api/health
```

Xem k8s/https/README.md để triển khai và kiểm tra HTTPS. Không xóa thư mục dữ liệu/chứng chỉ để thử lại.

## Phát triển và kiểm thử

Cần Node.js 24. Sau khi clone, chạy npm ci, npm test, npm run build. npm run dev chạy giao diện và API local.
Để dùng Docker, copy .env.example thành .env rồi đặt mật khẩu riêng; xem docs/docker.md.
Mỗi thay đổi dùng nhánh riêng và pull request. Build/push image với tag phiên bản mới, cập nhật manifest tương ứng rồi triển khai theo k8s/DEPLOY.md; không ghi đè tag đã dùng để demo.

## Việc nhóm cần hoàn thiện

- Khắc phục HTTPS và kiểm tra giao diện/API qua cả hai tên miền.
- Hoàn thiện giao diện/chức năng được phân công; kiểm thử sau thay đổi.
- Thu thập ảnh minh chứng scale, rollout/rollback, worker failure và phục hồi.
- Đối chiếu đề bài, viết báo cáo và chuẩn bị slide/kịch bản thuyết trình.

## Dữ liệu và quyền truy cập

Không commit .env, SSH private key, kubeconfig hoặc mật khẩu DB. Thành viên cần quyền Azure/SSH qua kênh riêng; repo không cấp quyền truy cập cloud.
PostgreSQL chỉ có một bản trên ổ cp, không phải database HA. Không xóa VM/ổ đĩa/PV để tiết kiệm chi phí.
Khi nghỉ, Stop các VM trong Azure và kiểm tra Stopped (deallocated); disk/public IP vẫn có thể tính phí. Khi bật lại, kiểm tra node và ứng dụng trước demo.
NSG SSH giới hạn theo IP mạng hiện tại; IP thay đổi có thể gây timeout.
Ứng dụng demo chưa có đăng nhập/phân quyền, người truy cập có thể sửa task.
