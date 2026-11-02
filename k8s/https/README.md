# HTTPS cho beegun.site

Caddy reverse proxy chạy trong Kubernetes trên cp, dùng hostNetwork để nhận TCP 80/443. Đây không phải Kubernetes Ingress Controller. Ứng dụng tiếp tục dùng NodePort theo yêu cầu bài; không cần cloud LoadBalancer. Đường đi: DNS -> cp:443 -> Caddy -> cp:30080 -> frontend Service -> Pods.

Điều kiện: DNS A beegun.site và www trỏ đúng public IP cp; không có AAAA trỏ sai; NSG cho Internet vào TCP 80/443, đích 172.16.0.4/32. Không mở admin Caddy, database hoặc Kubernetes API. Cả ba VM đang chạy, API NodePort hoạt động. Dữ liệu demo hiện không có đăng nhập: người truy cập web có thể thêm/cập nhật công việc.

Trên Windows, chuyển thư mục https vào ~/k8s trên cp bằng scp.

Trên cp:

```bash
cd ~/k8s/https
kubectl -n midterm-app create configmap caddy-config --from-file=Caddyfile --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f caddy.yaml
kubectl -n midterm-app rollout status deployment/caddy --timeout=180s
kubectl -n midterm-app logs deployment/caddy --tail=80
curl -I https://beegun.site
curl -f https://beegun.site/api/health
```

Readiness chỉ xác nhận cổng có listener, không chứng minh chứng chỉ đã cấp. Kiểm tra HTTPS thật không dùng -k. Caddy tự xin/gia hạn chứng chỉ khi DNS và cổng đáp ứng. Certificate và ACME account nằm trên OS disk cp tại /var/lib/midterm-caddy; giữ thư mục này qua restart để tránh xin lại liên tục. Hệ thống chỉ phục vụ khi cp và ứng dụng đang hoạt động; đây là điểm lỗi đơn của lab.

Sau khi sửa Caddyfile, apply lại ConfigMap như trên rồi `kubectl -n midterm-app rollout restart deployment/caddy`. Strategy Recreate tránh hai Pod tranh cổng host nhưng có gián đoạn ngắn.

Tắt HTTPS proxy nếu cần: `kubectl -n midterm-app scale deployment/caddy --replicas=0`; NodePort và SSH tunnel vẫn dùng được. Không xóa thư mục chứng chỉ.

Nguồn: https://caddyserver.com/docs/automatic-https
