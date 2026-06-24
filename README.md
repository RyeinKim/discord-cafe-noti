# discord-cafe-noti

평일 오전 11:15에 Discord 채널에 커피 주문판(버튼)을 게시하고, **11:30에 자동 마감 + 주문 종합**을 올리는 봇.

- 버튼 클릭으로 개인별 주문 → `data/orders-YYYY-MM-DD.json`에 기록(append-only 감사 로그 포함)
- **11:30 마감 후에는 변경 불가**(종합 고정). 마감 전까지는 변경 가능(`config.lockOnFirstChoice`로 첫 선택 고정으로 바꿀 수 있음)
- 재시작으로 게시/마감을 놓치면 부팅 시 자동 보정
- Node.js + discord.js v14 + node-cron v4

## 1. Discord 봇 준비

1. https://discord.com/developers/applications → **New Application** → 이름 입력
2. **Bot** 탭 → **Reset Token** → 토큰 복사
3. **OAuth2 → URL Generator** → 스코프 `bot` + 권한 `Send Messages`/`Embed Links`/`Read Message History` → 생성된 URL로 서버에 봇 초대
4. `.env` 작성:
   ```bash
   cp .env.example .env
   # .env 열어서 BOT_TOKEN 채우기 (CHANNEL_ID 기본값 있음)
   ```

## 2. 실행 방법

### A) Docker (권장 — 서버 이전 용이)

`node:22-alpine` 베이스라 **macOS(arm64) · Ubuntu(amd64) 동일하게** 빌드/실행됩니다.

```bash
docker compose up -d --build      # 빌드 + 백그라운드 실행
docker compose logs -f            # 로그 확인
docker compose down               # 중지
```

- 주문 기록은 호스트의 `./data`에 영속(컨테이너 교체해도 보존).
- 재부팅/크래시 시 `restart: unless-stopped`로 자동 복귀.

다른 아키텍처용 이미지를 한 번에 만들어 레지스트리에 푸시하려면(선택):
```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t <registry>/discord-cafe-noti:latest --push .
```

### B) Node 직접 / pm2 (Docker 안 쓸 때)

```bash
npm install
node src/index.js                 # 테스트 실행

# 상주(라즈베리파이/PC)
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup            # 부팅 시 자동 시작
```

## 3. 설정 (`src/config.js`)

| 항목 | 설명 |
|---|---|
| `menu` | 메뉴 1~25개 (`emoji`, `label`) |
| `open` / `close` | 게시/마감 시각(KST). cron·부팅복구가 공유 |
| `weekdays` | 게시 요일 (기본 월~금) |
| `lockOnFirstChoice` | `true`면 첫 선택 후 변경 불가 |

## 4. 동작 확인

게시/마감을 즉시 보려면 `src/config.js`의 `open`/`close`를 현재 시각 +1~2분으로 잠깐 바꿔 실행해 보세요. 봇 실행 중 버튼을 눌러 주문 → 마감 시각에 종합이 올라오는지 확인.
