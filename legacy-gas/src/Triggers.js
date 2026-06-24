/**
 * 설치/운영용 헬퍼 함수 모음.
 * GAS 편집기에서 함수 선택 후 ▶ 실행으로 1회씩 사용한다.
 */

/**
 * 매일 11:15(KST) 트리거를 설치한다. 최초 1회만 실행하면 된다.
 * 주의: Apps Script 시간 트리거는 분 단위 정밀 보장이 안 됨(보통 ±15분).
 * everyDays(1)로 매일 깨우고, 평일 여부는 dailyCoffeePoll에서 KST 기준으로 판단한다.
 */
function setupDailyTrigger() {
  validateConfig_(); // 설정이 잘못된 채로 트리거를 거는 것을 방지

  const hour = CONFIG.trigger.hour;
  if (hour <= 1 || hour >= 23) {
    // ±15분 오차가 자정/날짜 경계를 넘으면 평일 판정이 어긋날 수 있다.
    console.warn('주의: trigger.hour=' + hour + '는 자정 근처라 ±15분 오차로 평일 판정이 어긋날 수 있습니다.');
  }

  deleteCoffeeTriggers(); // 중복 설치 방지
  ScriptApp.newTrigger('dailyCoffeePoll')
    .timeBased()
    .atHour(hour)
    .nearMinute(CONFIG.trigger.nearMinute)
    .everyDays(1)
    .inTimezone('Asia/Seoul')
    .create();
  console.log(
    '트리거 설치 완료: 매일 ' +
      hour + ':' + ('0' + CONFIG.trigger.nearMinute).slice(-2) +
      ' (KST, ±15분), 평일만 게시'
  );
}

/** dailyCoffeePoll에 걸린 기존 트리거를 모두 제거한다. */
function deleteCoffeeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCoffeePoll') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log('기존 트리거 ' + removed + '개 제거');
}

/**
 * webhook URL을 Script Properties에 저장한다. 최초 1회만 실행.
 * GAS 편집기에서 이 함수의 인자 자리에 URL을 넣어 실행하거나,
 * 프로젝트 설정 > 스크립트 속성에 DISCORD_WEBHOOK_URL을 직접 추가해도 된다.
 * @param {string} url Discord webhook URL
 */
function setWebhookUrl(url) {
  const ok = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url || '');
  if (!ok) {
    throw new Error('유효한 Discord webhook URL이 아닙니다. 예: https://discord.com/api/webhooks/{id}/{token}');
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.webhookPropKey, url);
  console.log('webhook URL 저장 완료.');
}

/** 멱등성 기록(오늘 게시함)을 지운다 — 같은 날 다시 게시해야 할 때 1회 실행. */
function clearPostedDate() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.lastPostedPropKey);
  console.log('게시 기록(' + CONFIG.lastPostedPropKey + ') 삭제 — 다음 실행에서 다시 게시됩니다.');
}

/**
 * ⚠️ 실제 채널에 "진짜" 투표를 즉시 게시한다(테스트 채널 권장).
 * 평일 체크와 멱등성 가드를 모두 우회하며, 게시 기록(LAST_POSTED_DATE)도 남기지 않는다.
 * 동작 확인용으로만 사용할 것.
 */
function testPollNow() {
  const msg = sendCoffeePoll();
  console.log('테스트 게시 완료: ' + JSON.stringify({ id: msg.id, channel_id: msg.channel_id }));
}
