#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ "$(hostname)" != cp ]; then
  echo 'Run this script on cp as azureuser.' >&2
  exit 1
fi
sudo mkdir -p /var/lib/midterm-postgres
kubectl apply -f 00-namespace.yaml
if ! kubectl -n midterm-app get secret db-credentials >/dev/null 2>&1; then
  umask 077
  secret_dir=$(mktemp -d)
  trap 'rm -f "$secret_dir/password"; rmdir "$secret_dir"' EXIT
  openssl rand -hex 24 | tr -d '\n' > "$secret_dir/password"
  kubectl -n midterm-app create secret generic db-credentials \
    --from-file=password="$secret_dir/password" --dry-run=client -o yaml | kubectl apply -f -
fi
kubectl apply -f 10-postgres.yaml
kubectl -n midterm-app rollout status deployment/postgres --timeout=300s
kubectl apply -f 20-backend.yaml
kubectl -n midterm-app rollout status deployment/backend --timeout=300s
kubectl apply -f 30-frontend.yaml
kubectl -n midterm-app rollout status deployment/frontend --timeout=300s
kubectl -n midterm-app get pods -o wide
kubectl -n midterm-app get services,pvc
curl --fail --show-error http://172.16.0.4:30080/api/health
