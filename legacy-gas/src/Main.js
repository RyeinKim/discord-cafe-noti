/**
 * 트리거 진입점: 평일이면 커피 Poll을 게시한다.
 * 매일 11:15 트리거(everyDays)로 호출되며, 평일 여부는 여기서 KST 기준으로 판단한다.
 * 멱등성: 같은 날 이미 게시했으면 건너뛴다(트리거 중복 발화/수동 재실행 시 중복 방지).
 */
function dailyCoffeePoll() {
  if (CONFIG.weekdaysOnly && !isWeekdayKST_()) {
    console.log('주말이라 건너뜀: ' + nowKST_());
    return;
  }

  const today = todayKST_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CONFIG.lastPostedPropKey) === today) {
    console.log('오늘(' + today + ') 이미 게시함 — 중복 방지로 건너뜀');
    return;
  }

  sendCoffeePoll(); // 실패 시 throw → 아래 마킹이 안 되어, 수동 재실행으로 복구 가능
  props.setProperty(CONFIG.lastPostedPropKey, today);
}

/**
 * Discord webhook으로 네이티브 Poll을 1회 게시한다.
 * 봇/토큰 불필요 — webhook POST 한 번. ?wait=true로 게시된 메시지 정보를 회수해 로그에 남긴다.
 * 일시적 실패(429/5xx)는 재시도하고, 영구 실패(4xx)는 즉시 명확한 에러로 throw한다.
 * @return {Object} 게시된 메시지 객체(id, channel_id 포함). 응답 파싱 실패 시 빈 객체.
 */
function sendCoffeePoll() {
  validateConfig_();
  const webhookUrl = getWebhookUrl_();

  const payload = {
    poll: {
      question: { text: CONFIG.question },
      answers: CONFIG.answers.map(function (a) {
        return { poll_media: { text: a.text, emoji: { name: a.emoji } } };
      }),
      duration: CONFIG.durationHours,
      allow_multiselect: CONFIG.allowMultiselect,
      layout_type: 1, // DEFAULT (현재 유일 지원값)
    },
  };
  if (CONFIG.content) payload.content = CONFIG.content;
  if (CONFIG.username) payload.username = CONFIG.username;
  if (CONFIG.avatarUrl) payload.avatar_url = CONFIG.avatarUrl;

  const res = fetchWithRetry_(webhookUrl + '?wait=true', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // 실패 시 예외 대신 응답 본문을 읽어 원인 분기/로깅
  });

  // 여기 도달 = 2xx 성공. 응답 파싱이 실패해도 "게시는 성공"으로 처리한다.
  let msg = {};
  try {
    msg = JSON.parse(res.getContentText()) || {};
  } catch (e) {
    msg = {};
  }
  console.log(
    'Poll 게시 성공' +
      (msg.id ? ': message ' + msg.id + ' / channel ' + msg.channel_id : ' (응답 파싱 생략)') +
      ' @ ' + nowKST_()
  );
  return msg;
}

/**
 * UrlFetchApp 래퍼: 2xx면 응답 반환. 429/5xx는 재시도, 그 외(4xx)는 즉시 throw.
 * 429는 응답의 retry_after(초)를 따르고, 너무 길면(>30s) 재시도하지 않는다(실행 6분 한도 고려).
 * @return {HTTPResponse} 2xx 응답
 */
function fetchWithRetry_(url, options, maxAttempts) {
  maxAttempts = maxAttempts || 3;
  let lastCode = 0;
  let lastBody = '';
  let attempts = 0; // 실제 시도 횟수(로그 정확도용)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    let res;
    try {
      res = UrlFetchApp.fetch(url, options);
    } catch (e) {
      // DNS/타임아웃 등 네트워크 레벨 예외 — 메시지에 요청 URL(=토큰)이 섞일 수 있어 마스킹
      throw new Error('webhook 요청 실패(네트워크): ' + maskWebhook_(String((e && e.message) || e)));
    }

    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return res;

    lastCode = code;
    lastBody = res.getContentText();

    const retryable = code === 429 || (code >= 500 && code < 600);
    if (retryable && attempt < maxAttempts) {
      let waitMs = 1000 * attempt; // 기본 backoff (5xx 등)
      if (code === 429) {
        try {
          const j = JSON.parse(lastBody);
          if (j && typeof j.retry_after === 'number') waitMs = Math.ceil(j.retry_after * 1000);
        } catch (ignore) {
          /* retry_after 못 읽으면 기본 backoff */
        }
      }
      if (waitMs <= 30000) {
        Utilities.sleep(waitMs);
        continue;
      }
    }
    break; // 4xx(영구) 또는 재시도 소진/과대 대기
  }

  // silent fail 금지 — 상태코드와 본문(민감정보 마스킹)을 그대로 노출
  throw new Error(
    'Discord Poll 게시 실패 [' + lastCode + '] (시도 ' + attempts + '회): ' + maskWebhook_(lastBody)
  );
}

/** Script Properties에서 webhook URL을 읽는다. 없으면 명확한 안내 에러. */
function getWebhookUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty(CONFIG.webhookPropKey);
  if (!url) {
    throw new Error(
      'webhook URL이 설정되지 않았습니다. setWebhookUrl("https://discord.com/api/webhooks/...") 를 1회 실행하거나, ' +
        '프로젝트 설정 > 스크립트 속성에 ' + CONFIG.webhookPropKey + ' 키를 추가하세요.'
    );
  }
  return url;
}

/**
 * CONFIG 값 검증. 잘못된 설정으로 11:15에 Discord가 400을 주고 조용히 누락되는 것을 막는다.
 * 사람이 직접 고치는 값이므로 게시 직전에 한 번 검사한다.
 */
function validateConfig_() {
  const errs = [];

  if (!CONFIG.question || !String(CONFIG.question).trim()) errs.push('question이 비어 있음');
  else if (CONFIG.question.length > 300) errs.push('question이 300자를 초과');

  const ans = CONFIG.answers || [];
  if (ans.length < 1 || ans.length > 10) errs.push('answers는 1~10개여야 함 (현재 ' + ans.length + '개)');
  ans.forEach(function (a, i) {
    if (!a || !a.text || !String(a.text).trim()) errs.push('answers[' + i + '].text가 비어 있음');
    else if (a.text.length > 55) errs.push('answers[' + i + '].text가 55자를 초과');
    if (!a || !a.emoji) errs.push('answers[' + i + '].emoji가 비어 있음(현 설계는 이모지 필수)');
  });

  const d = CONFIG.durationHours;
  if (typeof d !== 'number' || isNaN(d) || d < 1 || d > 768 || Math.floor(d) !== d) {
    errs.push('durationHours는 1~768 사이 정수여야 함 (현재 ' + d + ')');
  }
  if (typeof CONFIG.allowMultiselect !== 'boolean') errs.push('allowMultiselect는 true/false여야 함');

  const h = CONFIG.trigger && CONFIG.trigger.hour;
  const m = CONFIG.trigger && CONFIG.trigger.nearMinute;
  if (typeof h !== 'number' || h < 0 || h > 23) errs.push('trigger.hour는 0~23이어야 함');
  if (typeof m !== 'number' || m < 0 || m > 59) errs.push('trigger.nearMinute는 0~59여야 함');

  if (errs.length) throw new Error('CONFIG 설정 오류:\n- ' + errs.join('\n- '));
}

/** webhook URL의 토큰 부분을 마스킹한다(로그/에러 노출 방지). */
function maskWebhook_(s) {
  return String(s).replace(/(\/webhooks\/\d+\/)[A-Za-z0-9_\-]+/g, '$1***');
}

/** KST 기준 평일(월~금) 여부. Utilities.formatDate의 'u'는 1=월 ... 7=일. */
function isWeekdayKST_() {
  const dow = Number(Utilities.formatDate(new Date(), 'Asia/Seoul', 'u'));
  return dow >= 1 && dow <= 5;
}

/** KST 오늘 날짜(yyyy-MM-dd) — 멱등성 키. */
function todayKST_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

/** 로그용 KST 현재 시각 문자열. */
function nowKST_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss (EEE)');
}
