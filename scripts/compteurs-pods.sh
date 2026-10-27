#!/bin/sh
# Lit http_requests_total de GET /scores directement sur chaque pod de l'API, sans passer par le Service
i=0
for pod in $(kubectl get pods -n clickfast -l app=scores-api -o name); do
  i=$((i + 1)); port=$((3200 + i))
  kubectl port-forward -n clickfast "$pod" "$port:3000" > /dev/null 2>&1 &
  PF_PID=$!
  sleep 2
  n=$(curl -s "localhost:$port/metrics" | grep 'http_requests_total{method="GET",route="/scores",status_code="200"}' | awk '{print $2}')
  echo "$pod : ${n:-0}"
  kill "$PF_PID"
done
