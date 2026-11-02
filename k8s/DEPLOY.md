# Triển khai lên cluster kubeadm

Chạy trên cp với kubeconfig của azureuser; cả ba node phải Ready. Images quyphu123/frontend:v1 và quyphu123/backend:v1 phải Public.

Windows PowerShell:

```powershell
scp -r -i "D:\Download\anhtest\cka-midterm-key.pem" "D:\CloudComputingM\k8s" azureuser@104.208.113.122:/home/azureuser/
```

Trên cp:

```bash
cd ~/k8s
bash deploy.sh
kubectl -n midterm-app get pods -o wide
```

Script tạo Secret qua YAML sinh tại runtime, không ghi mật khẩu vào repository. Khi chạy lại, giữ Secret đã có. Tất cả tài nguyên được tạo bằng kubectl apply. Không tự đổi/xóa Secret sau khi PostgreSQL đã khởi tạo.

Frontend và backend có 2 replicas, chỉ chạy worker1/worker2, dùng topology spreading mềm để ưu tiên phân bố đều và vẫn cho phép chạy lại trên worker còn sống. Kiểm tra cột NODE sau triển khai; đây không phải bảo đảm cứng khi cluster thiếu tài nguyên. Khi bật lại worker, Pod đã chuyển đi không tự cân bằng lại.

PostgreSQL có 1 replica trên cp, local PV lưu tại /var/lib/midterm-postgres trên OS managed disk, Retain. 5Gi là dung lượng khai báo, không phải quota filesystem được cưỡng chế. Dữ liệu giữ qua restart/deallocate nếu giữ OS disk. Không xóa VM/disk khi còn cần dữ liệu. Database không HA; mất cp thì mất cả control plane và khả năng truy cập database. Đây là đánh đổi cho lab 3 VM, không dùng làm kiến trúc production. Yêu cầu 2 replicas áp dụng cho frontend/backend; cần giải thích database bổ sung trong báo cáo.

Service frontend mở NodePort 30080. Kiểm tra nội bộ từ cp:

```bash
curl -f http://172.16.0.4:30080/api/health
```

Để xem web không cần mở thêm cổng Azure, chạy trên Windows và giữ terminal mở:

```powershell
ssh -N -L 18080:172.16.0.4:30080 -i "D:\Download\anhtest\cka-midterm-key.pem" azureuser@104.208.113.122
```

Mở http://127.0.0.1:18080. Hoặc cấu hình Azure NSG cho TCP 30080 từ IP của người demo để truy cập NodePort trực tiếp. Không mở PostgreSQL ra internet.

Nếu deploy thất bại:

```bash
kubectl -n midterm-app get pods,pvc -o wide
kubectl -n midterm-app get events --sort-by=.metadata.creationTimestamp
kubectl -n midterm-app logs deployment/backend --tail=50
```

Chưa chạy server-side validation hoặc triển khai trên cluster từ máy phát triển; kết quả thật cần kiểm tra trên cp. Script bash đã qua kiểm tra cú pháp.
