
#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="midterm-app"
DOMAIN="https://beegun.site"
SHA="${1:-}"

if [[ ! "$SHA" =~ ^[a-fA-F0-9]{40}$ ]]; then
  echo "ERROR: Provide a full 40-character Git commit SHA."
  echo "Usage: ./deploy.sh <git-commit-sha>"
  exit 1
fi

SHA="${SHA,,}"
TAG="sha-${SHA}"

BACKEND_IMAGE="quyphu123/backend:${TAG}"
FRONTEND_IMAGE="quyphu123/frontend:${TAG}"

echo "Checking Kubernetes connection..."
kubectl cluster-info >/dev/null

echo "Checking cluster nodes..."
kubectl get nodes

echo "Saving current images..."
OLD_BACKEND=$(kubectl -n "$NAMESPACE" get deployment backend \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
OLD_FRONTEND=$(kubectl -n "$NAMESPACE" get deployment frontend \
  -o jsonpath='{.spec.template.spec.containers[0].image}')

echo "Backend:  $OLD_BACKEND -> $BACKEND_IMAGE"
echo "Frontend: $OLD_FRONTEND -> $FRONTEND_IMAGE"

echo "Deploying backend..."
kubectl -n "$NAMESPACE" set image deployment/backend \
  "backend=${BACKEND_IMAGE}"

if ! kubectl -n "$NAMESPACE" rollout status \
  deployment/backend --timeout=180s; then
  echo "ERROR: Backend rollout failed."
  echo "Previous image: $OLD_BACKEND"
  exit 1
fi

echo "Deploying frontend..."
kubectl -n "$NAMESPACE" set image deployment/frontend \
  "frontend=${FRONTEND_IMAGE}"

if ! kubectl -n "$NAMESPACE" rollout status \
  deployment/frontend --timeout=180s; then
  echo "ERROR: Frontend rollout failed."
  echo "Previous image: $OLD_FRONTEND"
  exit 1
fi

echo "Checking API health..."
if ! curl --fail --silent --show-error \
  --max-time 15 "${DOMAIN}/api/health"; then
  echo
  echo "WARNING: Health check failed."
  echo "Check the network and application before rollback."
  exit 1
fi

echo
echo "Deployment completed: ${TAG}"
kubectl -n "$NAMESPACE" get deployments
