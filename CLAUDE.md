# discord-cafe-noti — 프로젝트 지침 (새 세션 필독)

> 새 세션 시작 시 **이 파일 + `STATUS.md` + 메모리 `edu-service-2-server`** 를 먼저 확인하고 진행한다.

## 개요
여러 Discord 채널에서 **채널별** 커피 주문 세션(버튼 주문 → `closeAt` 마감 → 종합 명단)을 운영하는 **discord.js v14 + node-cron v4** 봇(ESM). 상세 현황·파일구조·동작은 **`STATUS.md`** 에 정리돼 있다.

## ⚠️ 배포 서버 — 라이브 프로덕션 (반드시 숙지)
- 봇은 **`edu-service-2`** 서버의 `/root/discord-cafe-noti` **전용 `docker-compose.yml`** 로 운영된다. 같은 서버에 **edu 4개 라이브 사이트**(`/root/docker-compose.yml`)가 함께 돈다.
- 봇은 **전용 compose + outbound 443만** 사용 → 봇 재배포는 4개 사이트·nginx·포트와 **무관**.
- **접속 정보·구성·운영 함정 4가지**(nginx.conf inode / 방화벽 FW-LOCKDOWN / 레지스트리 인증 / 라이브 검증)는 **메모리 `edu-service-2-server`** 에 있다 — **서버 작업 전 반드시 확인**.
- **라이브 서버 배포(`docker compose pull && up -d`)는 사용자 승인 후 진행**(자동 차단됨). 적용 후 `docker logs --tail 30 discord-cafe-noti` 로 `로그인 완료`·`스케줄 재구성` 확인.

## 배포 절차
1. 멀티아치 빌드+push: `docker buildx build --builder multi-builder --platform linux/amd64,linux/arm64 -t portainer.startupcode.kr/discord-cafe-noti:latest --push .`
2. 서버 적용: `ssh edu-service-2 'cd /root/discord-cafe-noti && docker compose pull && docker compose up -d'`
3. 확인: `docker logs --tail 30 discord-cafe-noti`

## 코드 변경 관행
`node --check` + 로컬 스모크 → **적대적 검증 서브에이전트(opus, 최대 effort)** → 멀티아치 재빌드 push → GitHub push(`origin`+`work`, 둘 다 main). 커밋은 conventional commits.

**민감정보(ssh 키 경로·공인 IP·`BOT_TOKEN`)는 repo 커밋 금지** — `.env`/메모리에만 둔다. `.gitignore`가 `.env`/`data`/`logs` 차단.
