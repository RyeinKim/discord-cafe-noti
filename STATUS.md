# discord-cafe-noti — 프로젝트 현황 (개발 메모)

> 새 세션/협업자가 빠르게 파악하기 위한 문서. 실행법은 `README.md` 참고.

## 한 줄 요약

여러 Discord 채널에서 **채널별로** 커피 주문 세션을 운영하는 봇. 버튼으로 개인 주문 받고(서버 별명 표시), 자동/수동으로 마감하면 종합 명단을 게시한다.

## 히스토리 / 핵심 결정

- **원래 Google Apps Script(clasp)로 시작 → Discord 봇(discord.js)으로 전환.**
  - 이유: GAS `UrlFetchApp`은 User-Agent를 못 바꿔 Discord **봇 REST API가 Cloudflare 40333에 차단**됨. GAS `doPost`는 HTTP 헤더를 못 읽어 **인터랙션 서명검증(Ed25519) 불가** → 버튼 클릭 수신 불가. 그래서 webhook+GAS로는 "클릭→기록"이 불가능 → 상시 봇 필요.
  - 옛 GAS 코드는 `legacy-gas/`에 보관(미사용).
- **단일채널 → 멀티채널 + 채널별 독립 세션.** a채널 세션이 b채널을 막지 않음.
- **트리거·채널·메뉴·권한을 디스코드 슬래시 CRUD + `data/`에 런타임 영속.** `config.js`는 시드/기본값만.
- **배포: Docker 멀티아치(amd64/arm64) + 프라이빗 레지스트리.** GHCR CI는 만들었다가 제거(사용자 자체 레지스트리 사용).

## 스택 / 아키텍처

- Node.js + **discord.js v14** + **node-cron v4**, ESM(`"type":"module"`).
- 인텐트는 `Guilds`만 (버튼/슬래시 인터랙션 수신엔 충분, 아웃바운드 게이트웨이 봇이라 **인바운드 포트 개방 불필요**).
- **세션 모델**: 채널별 활성 세션 0~1개.
  - `data/state.json` → `{ activeByChannel: { [channelId]: sessionId } }`
  - `data/sessions/{channelId-날짜_HH-mm-ss}.json` → 세션 기록(마감해도 보존). `orders[userId]={choice,name,at}`, append-only `log`.
  - 세션 생성 시 **menu**와 **closeAt(마감 예정시각)을 스냅샷** → 도중 설정 바뀌어도 그 세션은 일관. closeAt = 트리거 세션은 트리거 `closeHM`, 수동/무트리거 세션은 `openedAt + config.sessionHours`(기본 2시간).
  - 버튼 `customId = order:<sessionId>:<idx>` → 세션 격리(지난 세션 버튼은 그 세션 finalized라 거부).
- **채널/트리거/메뉴**: `data/channels.json` → `{ [channelId]: { label, trigger:{openHM,closeHM,weekdays}|null, menu:[{emoji,label}]|null } }`. 기본 = 트리거 없음(수동), menu null이면 config 기본.
- **권한 화이트리스트**: `data/access.json` → `{ roles:[roleId], users:[userId], seededAt }`. **역할은 ID 매칭**(이름 변경에 안전). `syncAccess(client)`가 시작 시 기존 이름→ID 마이그레이션 + `config.adminRoleName` 최초 시드(`seededAt` 플래그로 멱등 — 쓰기 실패 시 부활 방지). **@everyone(=길드ID)은 저장 계층에서 항상 제외**(전체 개방 방지).
- **로그**: `logs/bot-YYYY-MM-DD.log` 구조화(`시각 LEVEL 메시지 {ctx}`), 콘솔+파일, 에러는 스택.

## 파일 구조 (src/)

| 파일 | 역할 |
|---|---|
| `config.js` | 전역 기본값/시드 (메뉴, 타임존, `adminRoleName` 시드, 마감정책, `sessionHours`(수동 세션 유지시간, 기본 2h), 트리거 기본시각) |
| `index.js` | 봇 진입·인터랙션·`/cafe` 명령·세션 open/close·부팅복구·isAllowed |
| `store.js` | 채널별 세션 저장/조회 |
| `channels.js` | 채널·트리거·메뉴 관리(channels.json) |
| `access.js` | 권한 화이트리스트(access.json), 역할ID/유저ID, syncAccess 마이그레이션 |
| `order-board.js` | 버튼판/마감 종합/`/cafe help` 임베드 |
| `scheduler.js` | node-cron 트리거 게시 cron + 전역 매분 마감체커 동적 재구성(rebuildScheduler) |
| `logger.js` | 구조화 로그(콘솔+파일) |
| `util.js` | JSON IO(원자적 tmp→rename, 손상 백업) |

기타: `entrypoint.sh`(root로 볼륨 권한 보정 후 su-exec node 강등), `Dockerfile`, `docker-compose.yml`(배포/레지스트리), `docker-compose.build.yml`(개발/빌드), `legacy-gas/`(옛 GAS).

## 슬래시 명령 (`/cafe`)

- `open` / `close` / `status` / `help`
- `trigger set open:HH:MM close:HH:MM days:평일|매일|주말|0-6콤마` / `trigger off` / `trigger show`
- `channel add` / `remove` / `list`
- `menu set items:a, b, c` (이모지 1️⃣2️⃣3️⃣ 자동, 1~10개) / `menu show` / `reset`
- `role add|remove|list @역할` (서버 관리자만, ID 매칭, @everyone 거부)
- `user add|remove|list @유저` (서버 관리자만)

**권한**: 서버 관리자(ManageGuild) **OR** 허용 역할 보유 **OR** 허용 유저 → `/cafe` 사용(`isAllowed` fail-closed, DM 거부). 단 `role`/`user` 관리(화이트리스트 변경)는 **관리자만**(권한 상승 방지). 명령은 길드 전용(`dm_permission:false` + `inGuild()` 가드). 트리거/채널/메뉴 변경 시 스케줄러 즉시 재구성.

## 동작 요약

- 게시: 트리거 있는 채널은 `openHM`에 자동 게시, 없으면 수동 `/cafe open`.
- **마감은 세션 `closeAt`(마감 예정시각) 단일 기준** — 전역 **매분 체커**(`closeDueSessions`)가 `closeAt` 도달 시 마감. 트리거 세션은 트리거 `closeHM`, **수동 세션은 open + `sessionHours`(기본 2h)**. 트리거가 몇 시간이든 트리거 `closeHM` 우선. (`trigger set`은 `close>open` 검증, 게시 지연·역전 시 폴백)
- 버튼 클릭 → 개인 주문(서버 별명). **마감 전 변경 가능, 마감 후 고정**(`lockOnFirstChoice=true`면 첫 선택 고정). **같은 메뉴 재클릭은 멱등**(스레드·로그 중복 없이 "이미 주문됨" 안내).
- 주문판에 `⏰ 마감 HH:MM`(closeAt) 표시. 마감되면 `🔒` 으로 버튼 비활성화.
- 실시간 **스레드 로그**(`별명 → 메뉴`, 변경만 표시). 마감 시 **종합 명단** 1회 게시(`_didFinalize`로 중복 방지) + 스레드 보관.
- **부팅 복구**: 재시작 시 `closeAt` 지난 활성 세션 마감 + 트리거 게시시간대 미게시 게시(멱등). 등록 해제된 채널의 잔존 세션도 마감(`getChannelIds ∪ activeChannelIds`).

## 배포

- 멀티아치 이미지 → 레지스트리 **`portainer.startupcode.kr/discord-cafe-noti:latest`**.
- 빌드+push: `docker buildx build --builder multi-builder --platform linux/amd64,linux/arm64 -t portainer.startupcode.kr/discord-cafe-noti:latest --push .`
- 서버: `docker-compose.yml`(image pull) + `.env`만 두고 `docker compose pull && docker compose up -d`.
- `.env`: **`BOT_TOKEN` 필수**, `CHANNEL_IDS` 선택(보통 비우고 디스코드 `/cafe channel add`).
- `entrypoint.sh`가 볼륨(`data`/`logs`) 권한을 자동 보정(EACCES 방지). 비root(node uid 1000) 실행.
- **인바운드 포트 개방 불필요** — Discord로 나가는 아웃바운드(443)만.

## 환경 / 좌표

- Discord 계정: wayne@startupcode.kr.
- 채널: **테스트 `1519006705168552058`**, **실제 `1516717960348041298`**.
- GitHub 리모트: `origin` = RyeinKim/discord-cafe-noti, `work` = startup-life/discord-cafe-noti (둘 다 `main`에 push).
- 배포 서버: `edu-service-2`(**라이브 프로덕션**, `/root/discord-cafe-noti`, root). 봇 전용 `docker-compose.yml`이라 같은 서버의 edu 4개 앱과 분리 → 봇 재배포가 사이트에 영향 없음. (서버 접속·운영 함정은 메모리 `edu-service-2-server` 참고)
- 봇 토큰은 `.env`에만(절대 커밋 X — `.gitignore`로 `.env`/`data`/`logs` 차단).

## 현재 상태 / 남은 일

- ✅ 봇 기능 완성, 다회 적대적 검증 통과(치명 0). edu-service-2에 **최신 이미지 배포·가동 중**(`Coffee Bot#1691`, 트리거 채널 1개, 매분 마감체커 동작).
- ✅ **마감 로직 = closeAt 단일 기준**(수동 2h / 트리거 우선) + 매분 전역 체커로 통일.
- ✅ **실사용 버그 수정**: 같은 선택 재클릭 시 스레드·주문 로그 중복 → 멱등 처리.
- ✅ **종합검증 후속 수정**(치명 0): 마감 종합 중복게시 방지(`_didFinalize`), 트리거 조기마감 방지(`close>open` 검증·폴백), 권한 fail-closed·DM차단·@everyone 필터, 해제 채널 잔존세션 마감, node-cron `destroy` 누수·entrypoint chown 경고.
- ⏳ **실제 채널(`1516...`) 자동 운영**: 그 채널에서 `/cafe channel add` + `/cafe trigger set` 하면 다음날부터 자동(트리거 채널 1개 등록 확인됨).
- (선택, 비치명) 자정 넘김 트리거 미지원(명시 거부), access.js add/remove save try/catch 일관화 — 운영 위험 낮음.

## 개발 관행

코드 변경 → `node --check` syntax + 로컬 스모크 → **적대적 검증 서브에이전트** → 멀티아치 재빌드 push → GitHub push(`origin`+`work`). 커밋은 conventional commits.
