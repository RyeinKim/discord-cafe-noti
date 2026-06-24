# discord-cafe-noti
# node:22-alpine은 linux/amd64 · linux/arm64 둘 다 제공 → macOS(ARM)·Ubuntu(amd64) 동일 Dockerfile로 빌드.
FROM node:22-alpine

# node-cron의 timezone 처리를 위해 tzdata 설치(코드는 Intl로 KST를 명시하지만 안전하게 포함)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul
ENV NODE_ENV=production

WORKDIR /app

# 의존성 레이어(소스보다 먼저 — 캐시 활용). lock 파일 있으면 재현 가능한 ci 설치.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 애플리케이션 소스
COPY src ./src

# 주문 기록·로그는 볼륨으로 영속(컨테이너 교체해도 보존). 비root 실행을 위한 소유권.
RUN mkdir -p /app/data /app/logs && chown -R node:node /app
VOLUME ["/app/data", "/app/logs"]

USER node
CMD ["node", "src/index.js"]
