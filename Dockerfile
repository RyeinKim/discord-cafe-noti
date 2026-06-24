# discord-cafe-noti
# node:22-alpine은 linux/amd64 · linux/arm64 둘 다 제공 → macOS(ARM)·Ubuntu(amd64) 동일 Dockerfile로 빌드.
FROM node:22-alpine

# tzdata(timezone) + su-exec(entrypoint에서 root→node 강등용)
RUN apk add --no-cache tzdata su-exec
ENV TZ=Asia/Seoul
ENV NODE_ENV=production

WORKDIR /app

# 의존성 레이어(소스보다 먼저 — 캐시 활용). lock 파일 있으면 재현 가능한 ci 설치.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 애플리케이션 소스
COPY src ./src

# 주문 기록·로그는 볼륨으로 영속(컨테이너 교체해도 보존).
RUN mkdir -p /app/data /app/logs && chown -R node:node /app
VOLUME ["/app/data", "/app/logs"]

# 시작 시 entrypoint가 root로 볼륨 권한을 보정한 뒤 node 유저로 강등 실행(바인드 마운트 권한 문제 방지).
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/index.js"]
