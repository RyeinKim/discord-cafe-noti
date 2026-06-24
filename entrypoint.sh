#!/bin/sh
set -e
# 바인드 마운트된 data/logs의 소유권을 node(uid 1000)로 보정한 뒤 node 권한으로 강등 실행.
# (root로 시작 → chown → su-exec node) 호스트 디렉토리가 root 소유여도 권한 문제 없음.
mkdir -p /app/data /app/logs
chown -R node:node /app/data /app/logs 2>/dev/null || true
exec su-exec node "$@"
