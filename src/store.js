import { join } from 'node:path';
import { config } from './config.js';
import { getMenu } from './channels.js';
import { readJSON, writeJSON } from './util.js';

/**
 * 채널별 세션 저장소.
 * - data/state.json: { activeByChannel: { [channelId]: sessionId } } — 채널마다 활성 세션 0~1개.
 * - data/sessions/{id}.json: 세션별 기록(마감돼도 보존). id = `${channelId}-${date}_${HH-mm-ss}`.
 *   세션: { id, channelId, date, openedAt, closedAt, finalized, boardMessageId, threadId, menu, orders, log }
 *   menu = 세션 생성 시점의 채널 메뉴 스냅샷(도중 메뉴 변경에도 일관). orders[userId] = { choice, name, at }.
 */

const STATE_FILE = join(config.dataDir, 'state.json');
const SESSIONS_DIR = join(config.dataDir, 'sessions');

// ---- KST helpers ----
export function todayKST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}
export function kstWeekday() {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short' }).format(new Date());
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
}
export function kstMinutes() {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
function kstClock() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(/:/g, '-');
}

function sessionFile(id) {
  return join(SESSIONS_DIR, `${id}.json`);
}
function loadState() {
  return readJSON(STATE_FILE, { activeByChannel: {} });
}
function setActive(channelId, sessionId) {
  const st = loadState();
  if (!st.activeByChannel) st.activeByChannel = {};
  if (sessionId) st.activeByChannel[channelId] = sessionId;
  else delete st.activeByChannel[channelId];
  writeJSON(STATE_FILE, st);
}

// ---- 세션 API ----
export function loadSession(id) {
  return id ? readJSON(sessionFile(id), null) : null;
}

/** 채널의 활성 세션(없으면 null). */
export function getActiveSession(channelId) {
  const st = loadState();
  const id = st.activeByChannel?.[channelId];
  return id ? loadSession(id) : null;
}

/** 채널에 새 세션 생성 + 활성 등록. 채널 메뉴를 세션에 스냅샷한다. */
export function createSession(channelId) {
  const date = todayKST();
  const id = `${channelId}-${date}_${kstClock()}`;
  const session = {
    id,
    channelId,
    date,
    openedAt: new Date().toISOString(),
    closedAt: null,
    finalized: false,
    boardMessageId: null,
    threadId: null,
    menu: getMenu(channelId).map((m) => ({ emoji: m.emoji, label: m.label })), // 스냅샷
    orders: {},
    log: [],
  };
  writeJSON(sessionFile(id), session);
  setActive(channelId, id);
  return session;
}

export function setBoardMessage(id, messageId) {
  const s = loadSession(id);
  if (!s) return;
  s.boardMessageId = messageId;
  writeJSON(sessionFile(id), s);
}
export function setThread(id, threadId) {
  const s = loadSession(id);
  if (!s) return;
  s.threadId = threadId;
  writeJSON(sessionFile(id), s);
}

/**
 * 세션에 주문 기록. 세션이 없거나 마감됐으면 거부. lockOnFirstChoice면 변경 거부.
 * @return {{ok:boolean, reason?:string, existing?:object, changed?:boolean, session?:object}}
 */
export function recordToSession(id, userId, name, choiceIndex) {
  const s = loadSession(id);
  if (!s) return { ok: false, reason: 'no-session' };
  if (s.finalized) return { ok: false, reason: 'closed' };

  const existing = s.orders[userId];
  if (existing && config.lockOnFirstChoice) {
    return { ok: false, reason: 'locked', existing };
  }

  const changed = !!existing && existing.choice !== choiceIndex;
  const at = new Date().toISOString();
  s.orders[userId] = { choice: choiceIndex, name, at };
  s.log.push({ userId, name, choice: choiceIndex, at }); // append-only
  writeJSON(sessionFile(id), s);
  return { ok: true, changed, session: s };
}

/** 채널의 활성 세션을 마감(파일 보존)하고 포인터 해제. 마감된 세션(or null) 반환. */
export function finalizeActive(channelId) {
  const st = loadState();
  const id = st.activeByChannel?.[channelId];
  if (!id) return null;
  const s = loadSession(id);
  if (s && !s.finalized) {
    s.finalized = true;
    s.closedAt = new Date().toISOString();
    writeJSON(sessionFile(id), s);
  }
  setActive(channelId, null);
  return s;
}
