import cron from 'node-cron';
import { config } from './config.js';
import { loadChannels } from './channels.js';
import { log } from './logger.js';

/**
 * channels.json의 채널별 트리거를 읽어 cron을 (재)구성한다.
 * 트리거 변경 시 다시 호출하면 기존 cron을 모두 멈추고 새로 등록한다.
 * onOpen/onClose는 channelId를 인자로 받는다.
 */
let tasks = [];

export function rebuildScheduler({ onOpen, onClose }) {
  for (const t of tasks) {
    try {
      t.stop();
    } catch (_) {
      /* 이미 멈춤 무시 */
    }
  }
  tasks = [];

  const channels = loadChannels();
  let count = 0;
  for (const [channelId, cfg] of Object.entries(channels)) {
    const tr = cfg.trigger;
    if (!tr) continue;
    const [oh, om] = String(tr.openHM).split(':').map(Number);
    const [ch, cm] = String(tr.closeHM).split(':').map(Number);
    const days = (tr.weekdays && tr.weekdays.length ? tr.weekdays : [1, 2, 3, 4, 5]).join(',');
    const openExpr = `${om} ${oh} * * ${days}`;
    const closeExpr = `${cm} ${ch} * * ${days}`;
    if (!cron.validate(openExpr) || !cron.validate(closeExpr)) {
      log.warn('잘못된 트리거 cron — 건너뜀', { channelId, openExpr, closeExpr });
      continue;
    }
    tasks.push(cron.schedule(openExpr, () => onOpen(channelId), { timezone: config.timezone }));
    tasks.push(cron.schedule(closeExpr, () => onClose(channelId), { timezone: config.timezone }));
    count++;
  }
  log.info('스케줄 재구성', { triggerChannels: count, tz: config.timezone });
}
