import 'dotenv/config';

export const config = {
  token: process.env.BOT_TOKEN,

  // 봇이 운영하는 채널 목록(시드). .env의 CHANNEL_IDS(콤마구분) 또는 CHANNEL_ID(단일)로 덮어쓰기 가능.
  // 2단계에서 디스코드 /cafe trigger + data/channels.json으로 채널별 동적 관리 예정.
  channels: (process.env.CHANNEL_IDS || process.env.CHANNEL_ID || '1519006705168552058')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // 메뉴(버튼). 1~25개. customId는 'order:<sessionId>:<index>'.
  menu: [
    { emoji: '1️⃣', label: '아이스 아메리카노' },
    { emoji: '2️⃣', label: '아이스라떼' },
    { emoji: '3️⃣', label: '아이스티' },
  ],

  title: '오늘의 커피 주문 ☕',
  description: '아래 버튼으로 주문하세요. **11:30에 마감**됩니다.',

  // 스케줄(KST). 1단계는 등록 채널 공통 시각. 2단계에서 채널별로.
  timezone: 'Asia/Seoul',
  open: { hour: 11, minute: 15 },
  close: { hour: 11, minute: 30 },
  weekdays: [1, 2, 3, 4, 5], // 0=일 ... 6=토 → 월~금

  // /cafe 명령 사용 가능: 서버 관리자(항상) + 이 역할 보유자. 비우면('') 관리자만.
  adminRoleName: '스타트업코드',

  // 변경 정책: false = 마감 전 변경 가능(기본), true = 첫 선택 후 고정
  lockOnFirstChoice: false,

  // 저장/로그 폴더
  dataDir: 'data',
  logDir: 'logs',

  // 주문판에 스레드를 달아 클릭/변경을 실시간 기록
  logToThread: true,
};

/** cron 식(분 시 * * 요일). 1단계 공통 시각. */
export function openCron() {
  return `${config.open.minute} ${config.open.hour} * * ${config.weekdays.join(',')}`;
}
export function closeCron() {
  return `${config.close.minute} ${config.close.hour} * * ${config.weekdays.join(',')}`;
}

export const openMinutes = config.open.hour * 60 + config.open.minute;
export const closeMinutes = config.close.hour * 60 + config.close.minute;

// --- 시작 시 설정 검증 ---
if (!config.token) {
  throw new Error('BOT_TOKEN이 없습니다. .env 파일에 BOT_TOKEN=... 을 설정하세요 (.env.example 참고).');
}
if (!Array.isArray(config.channels) || config.channels.length < 1) {
  throw new Error('channels는 1개 이상이어야 합니다(.env CHANNEL_ID 또는 CHANNEL_IDS 확인).');
}
if (config.menu.length < 1 || config.menu.length > 25) {
  throw new Error(`menu는 1~25개여야 합니다(Discord 버튼 상한). 현재 ${config.menu.length}개.`);
}
config.menu.forEach((m, i) => {
  if (!m.label || !m.emoji) throw new Error(`menu[${i}]에 label 또는 emoji가 없습니다.`);
});
if (closeMinutes <= openMinutes) {
  throw new Error('close 시각은 open보다 뒤여야 합니다.');
}
