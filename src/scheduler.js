import cron from 'node-cron';
import { config } from './config.js';
import { loadChannels } from './channels.js';
import { log } from './logger.js';

/**
 * 트리거별 '게시(open)' cron + 전역 '마감 체커'(매 분) 재구성.
 * 마감은 세션 closeAt 기반(onCloseCheck)으로 통일 — 트리거 세션이든 수동 세션이든
 * closeAt 도달 시 마감된다. 트리거/채널 변경 시 다시 호출하면 갱신된다.
 */
let tasks = [];

export function rebuildScheduler({ onOpen, onCloseCheck }) {
  for (const t of tasks) {
    try {
      t.stop();
      if (typeof t.destroy === 'function') t.destroy(); // stop만으론 전역 레지스트리에서 안 빠짐 → 누수 방지
    } catch (_) {
      /* 이미 멈춤 */
    }
  }
  tasks = [];

  const channels = loadChannels();
  let count = 0;
  for (const [channelId, cfg] of Object.entries(channels)) {
    const tr = cfg.trigger;
    if (!tr) continue;
    const [oh, om] = String(tr.openHM).split(':').map(Number);
    const days = (tr.weekdays && tr.weekdays.length ? tr.weekdays : [1, 2, 3, 4, 5]).join(',');
    const openExpr = `${om} ${oh} * * ${days}`;
    if (!cron.validate(openExpr)) {
      log.warn('잘못된 트리거 cron — 건너뜀', { channelId, openExpr });
      continue;
    }
    tasks.push(cron.schedule(openExpr, () => onOpen(channelId), { timezone: config.timezone }));
    count++;
  }

  // 전역 마감 체커: 매 분 활성 세션의 closeAt 도달 여부 확인
  tasks.push(cron.schedule('* * * * *', onCloseCheck, { timezone: config.timezone }));

  log.info('스케줄 재구성', { triggerOpenChannels: count, tz: config.timezone });
}
