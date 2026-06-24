import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

/**
 * 콘솔(docker logs용)과 파일(logs/bot-YYYY-MM-DD.log)에 동시 기록하는 로거.
 * 형식: "YYYY-MM-DD HH:mm:ss  LEVEL  메시지  {컨텍스트}" — 사람·기계 모두 읽기 쉽게.
 * 에러는 스택까지 파일에 남겨 추적이 쉽다.
 */

const LOG_DIR = config.logDir || 'logs';

/** KST 타임스탬프 "YYYY-MM-DD HH:mm:ss". */
function stamp() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: config.timezone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());
}

/** 날짜별 로그 파일 경로. */
function logFile() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
  return join(LOG_DIR, `bot-${date}.log`);
}

function append(text) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(logFile(), text + '\n');
  } catch (e) {
    // 파일 기록 실패해도 콘솔엔 남으니 봇은 계속 동작
    console.error(`[logger] 파일 기록 실패: ${e.message}`);
  }
}

function emit(level, consoleFn, msg, ctx) {
  const ctxStr = ctx && Object.keys(ctx).length ? '  ' + JSON.stringify(ctx) : '';
  const line = `${stamp()}  ${level.padEnd(5)}  ${msg}${ctxStr}`;
  consoleFn(line);
  append(line);
}

export const log = {
  info: (msg, ctx) => emit('INFO', console.log, msg, ctx),
  warn: (msg, ctx) => emit('WARN', console.warn, msg, ctx),
  /** error(msg, errorOrCtx). 두 번째 인자가 Error면 메시지+스택을 함께 남긴다. */
  error: (msg, errOrCtx) => {
    if (errOrCtx instanceof Error) {
      emit('ERROR', console.error, `${msg}: ${errOrCtx.message}`);
      if (errOrCtx.stack) append(errOrCtx.stack);
    } else {
      emit('ERROR', console.error, msg, errOrCtx);
    }
  },
};
