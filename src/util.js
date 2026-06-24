import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { log } from './logger.js';

/** JSON 읽기. 없으면 fallback. 손상 시 백업 후 fallback. */
export function readJSON(p, fallback) {
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    const backup = `${p}.corrupt-${Date.now()}`;
    try {
      renameSync(p, backup);
      log.error('파일 손상 → 백업 후 기본값', { file: p, backup, reason: e.message });
    } catch (e2) {
      log.error('손상 파일 백업 실패', { file: p, reason: e2.message });
    }
    return fallback;
  }
}

/** 원자적 JSON 쓰기(tmp → rename). 실패 시 tmp 정리. */
export function writeJSON(p, obj) {
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(obj, null, 2));
    renameSync(tmp, p);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch (_) {
      /* 정리 실패 무시 */
    }
    throw e;
  }
}
