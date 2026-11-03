
#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="midterm-app"
APP="${1:-}"

if [[ "$APP" != "frontend" && "$APP" != "backend" ]]; then
  echo "Usage: ./rollback.sh frontend|backend"
  exit 1
fi

echo "Current deployment:"
kubectl -n "$NAMESPACE" get deployment "$APP" \
  -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'

echo "Rollout history:"
kubectl -n "$NAMESPACE" rollout history "deployment/$APP"

read -r -p "Rollback $APP to previous revision? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Cancelled."
  exit 0
fi

kubectl -n "$NAMESPACE" rollout undo "deployment/$APP"

kubectl -n "$NAMESPACE" rollout status \
  "deployment/$APP" --timeout=180s

echo "Image after rollback:"
kubectl -n "$NAMESPACE" get deployment "$APP" \
  -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'

echo "Rollback completed. Verify application functionality."
