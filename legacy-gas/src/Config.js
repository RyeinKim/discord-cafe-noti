/**
 * 커피 주문 Poll 설정.
 *
 * - webhook URL은 여기 두지 않고 Script Properties('DISCORD_WEBHOOK_URL')에서 읽는다(보안).
 *   값 입력: Triggers.js의 setWebhookUrl("https://discord.com/api/webhooks/...") 1회 실행
 *   또는 프로젝트 설정 > 스크립트 속성에 직접 추가.
 * - 평소엔 아래 메뉴/문구/마감시간만 고치면 된다. (저장값은 sendCoffeePoll 직전 validateConfig_로 검증됨)
 */
const CONFIG = {
  // Poll 질문. Discord poll의 question은 text만 지원(이모지 불가). 최대 300자.
  question: '오늘의 커피 뭐 마실래요? ☕',

  // 선택지: 1~10개. text는 최대 55자. emoji는 각 항목 앞에 붙는 이모지(현 설계는 필수).
  // 키캡 이모지 "1️⃣" = 숫자 + U+FE0F(variation selector) + U+20E3(keycap). 실제 게시 테스트로 동작 확인됨.
  answers: [
    { emoji: '1️⃣', text: '아메리카노' },
    { emoji: '2️⃣', text: '카페라떼' },
    { emoji: '3️⃣', text: '바닐라라떼' },
    { emoji: '4️⃣', text: '콜드브루' },
  ],

  // 투표 마감(시간 단위). 1~768(=32일) 정수. 11:15 게시 후 몇 시간 뒤 마감할지.
  durationHours: 3,

  // 복수 선택 허용 여부. 커피 하나만 고르게 하려면 false.
  allowMultiselect: false,

  // webhook 메시지에 표시할 이름/아바타(선택). 비우면 webhook 기본값 사용.
  username: '커피봇',
  avatarUrl: '',

  // poll 위에 함께 보낼 안내 문구(선택). 비우려면 ''.
  content: '',

  // 트리거 시각(KST 기준). Apps Script 시간 트리거는 분 단위 정밀 보장이 안 됨(보통 ±15분).
  // hour는 자정 근처(0~1, 23)를 피할 것 — ±15분 오차가 날짜 경계를 넘으면 평일 판정이 어긋날 수 있다.
  trigger: { hour: 11, nearMinute: 15 },

  // 평일(월~금)에만 게시. 공휴일은 별도 처리하지 않는다.
  weekdaysOnly: true,

  // Script Properties 키 이름.
  webhookPropKey: 'DISCORD_WEBHOOK_URL', // webhook URL 저장 키
  lastPostedPropKey: 'LAST_POSTED_DATE', // 멱등성: 마지막 게시 날짜(KST yyyy-MM-dd)
};
