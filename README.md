# discord-cafe-noti

여러 Discord 채널에서 **채널별로** 커피 주문 세션을 운영하는 봇. 버튼으로 개인별 주문을 받고, 자동/수동으로 마감하면 종합을 게시한다.

- 버튼 클릭 → 개인별 주문(서버 별명 표시), 마감 전 변경 가능 / **마감 후 고정**
- **채널별 세션**(동시에 1개) · **채널별 자동 트리거**(있을 수도/없을 수도) · **채널별 메뉴**
- 주문판에 **실시간 스레드 로그**(누가 뭘/변경)
- 트리거·채널·메뉴를 **디스코드 슬래시 명령으로 관리**(재배포 불필요)
- Node.js + discord.js v14 + node-cron v4 · 세션/설정은 `data/`에 영구 저장 · 구조화 로그 `logs/`

## 1. Discord 봇 준비

1. https://discord.com/developers/applications → **New Application**
2. **Bot** → **Reset Token** → 토큰 복사
3. **OAuth2 → URL Generator** → scopes `bot` + **`applications.commands`**
   권한: `Send Messages` / `Embed Links` / `Read Message History` / `Create Public Threads` / `Send Messages in Threads` → 생성된 URL로 서버에 초대
4. `.env` 작성:
   ```bash
   cp .env.example .env       # .env 열어 BOT_TOKEN 채우기 (CHANNEL_ID/CHANNEL_IDS로 운영 채널 시드)
   ```

## 2. 실행 방법

> **포트 개방 불필요** — 이 봇은 Discord로 나가는(outbound 443) 연결만 한다. 인바운드 listen이 없어 80/443 등을 열 필요가 없다(`docker-compose.yml`에 `ports:` 없음). 서버가 인터넷만 되면 동작.

### A) 배포 — `docker-compose.yml` + `.env` (서버에서 clone 없이)

`docker-compose.yml`은 레지스트리 이미지(`portainer.startupcode.kr/discord-cafe-noti:latest`)를 pull한다. **이 파일과 `.env`만** 서버에 두면 끝 — `.env`만 바꿔 그대로 재사용:
```bash
cp .env.example .env             # BOT_TOKEN·CHANNEL_IDS 채우기
docker compose up -d             # 이미지 pull + 실행
docker compose logs -f
docker compose down              # 중지
```
> 레지스트리 인증이 필요하면 먼저 `docker login portainer.startupcode.kr`. Portainer 스택으로 올려도 동일.

### B) 로컬 빌드(개발) · 이미지 push

소스에서 빌드해 로컬 실행:
```bash
docker compose -f docker-compose.build.yml up -d --build
```
멀티아치 이미지 빌드 + 레지스트리 push:
```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t portainer.startupcode.kr/discord-cafe-noti:latest --push .
```

### C) Node 직접 / pm2 (Docker 안 쓸 때)
```bash
npm install
node src/index.js                # 테스트 실행
npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save   # 상주
```

## 3. 슬래시 명령 (`/cafe`)

> 서버 관리자 또는 `config.adminRoleName` 역할 보유자만 사용. `/cafe help`로 도움말.

| 명령 | 설명 |
|---|---|
| `/cafe open` / `close` / `status` | 이 채널 세션 수동 열기 / 마감+종합 / 상태 |
| `/cafe trigger set open:11:15 close:11:30 days:평일` | 이 채널 자동 트리거 설정/수정(채널당 1개) |
| `/cafe trigger off` / `show` | 트리거 제거(수동만) / 확인 |
| `/cafe channel add` / `remove` / `list` | 운영 채널 등록 / 해제 / 목록 |
| `/cafe menu set items:아메리카노, 라떼, 아이스티` | 이 채널 메뉴 설정(이모지 1️⃣2️⃣3️⃣ 자동) |
| `/cafe menu show` / `reset` | 메뉴 확인 / 기본으로 |

- `days`: `평일`·`매일`·`주말` 또는 `0`(일)~`6`(토) 콤마. `trigger set`은 일부만 입력 시 나머지 기존값 유지.
- 메뉴는 **세션 열 때 스냅샷**되어 진행 중 변경에도 안전. 기본 상태는 **트리거 없음(수동)** + config 기본 메뉴.

## 4. 설정과 데이터

- **`src/config.js`**: 전역 기본값/시드 — 메뉴, 타임존, 권한 역할(`adminRoleName`), 마감 정책(`lockOnFirstChoice`), 운영 채널 시드(`channels`).
- **`data/channels.json`**: 채널별 트리거·메뉴(디스코드 명령으로 CRUD, 런타임 변경).
- **`data/sessions/*.json`**: 세션별 영구 기록(주문·감사 로그). **`data/state.json`**: 채널별 활성 세션 포인터.
- **`logs/bot-YYYY-MM-DD.log`**: 구조화 로그(에러는 스택 포함). `data/`·`logs/`는 볼륨으로 영속.

## 5. 동작 확인

`/cafe open` → 버튼으로 주문 → `/cafe status` → `/cafe close`로 종합 확인. 자동 트리거는 `/cafe trigger set`으로 켠다.
