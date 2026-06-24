import { join } from 'node:path';
import { config } from './config.js';
import { readJSON, writeJSON } from './util.js';

/**
 * 채널별 설정 관리(data/channels.json). 디스코드 /cafe channel·trigger로 동적 변경.
 * 구조: { [channelId]: { label, trigger: {openHM,closeHM,weekdays}|null, menu: [{emoji,label}]|null } }
 *  - trigger null  = 자동 트리거 없음(수동 open만)
 *  - menu null/빈값 = config.menu(기본 메뉴) 사용
 */

const CHANNELS_FILE = join(config.dataDir, 'channels.json');

/** 없으면 config.channels를 시드로 생성. 기본 상태 = 트리거 없음(수동), 메뉴=config 기본. */
export function loadChannels() {
  let ch = readJSON(CHANNELS_FILE, null);
  if (!ch) {
    ch = {};
    for (const id of config.channels) {
      ch[id] = { label: '', trigger: null, menu: null };
    }
    writeJSON(CHANNELS_FILE, ch);
  }
  return ch;
}
function saveChannels(ch) {
  writeJSON(CHANNELS_FILE, ch);
}

export function getChannelIds() {
  return Object.keys(loadChannels());
}
export function isManaged(id) {
  return !!loadChannels()[id];
}
export function getChannelConfig(id) {
  return loadChannels()[id] || null;
}
export function getTrigger(id) {
  return loadChannels()[id]?.trigger || null;
}
/** 채널 메뉴(없으면 config.menu 기본). 세션 생성 시 스냅샷용. */
export function getMenu(id) {
  const m = loadChannels()[id]?.menu;
  return Array.isArray(m) && m.length ? m : config.menu;
}

export function addChannel(id, label = '') {
  const ch = loadChannels();
  if (!ch[id]) ch[id] = { label, trigger: null, menu: null };
  else if (label) ch[id].label = label;
  saveChannels(ch);
  return ch[id];
}
export function removeChannel(id) {
  const ch = loadChannels();
  const existed = !!ch[id];
  delete ch[id];
  saveChannels(ch);
  return existed;
}
export function setTrigger(id, trigger) {
  const ch = loadChannels();
  if (!ch[id]) ch[id] = { label: '', trigger: null, menu: null };
  ch[id].trigger = trigger;
  saveChannels(ch);
}
export function clearTrigger(id) {
  const ch = loadChannels();
  if (ch[id]) {
    ch[id].trigger = null;
    saveChannels(ch);
  }
}
export function setMenu(id, menu) {
  const ch = loadChannels();
  if (!ch[id]) ch[id] = { label: '', trigger: null, menu: null };
  ch[id].menu = menu;
  saveChannels(ch);
}
