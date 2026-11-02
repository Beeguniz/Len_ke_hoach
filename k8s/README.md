# Kubernetes

Cụm Azure gồm cp, worker1 và worker2 đã được triển khai bằng kubeadm.
Frontend/backend dùng 2 replica, PostgreSQL dùng local PV trên cp.

- [Triển khai ứng dụng](DEPLOY.md)
- [Caddy và HTTPS](https/README.md)
- [Tình trạng và công việc bàn giao](../docs/HANDOFF.md)

Manifest nằm trong thư mục này. Không chạy lại kubeadm init trên cụm hiện có.
