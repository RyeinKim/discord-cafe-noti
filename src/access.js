import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { readJSON, writeJSON } from './util.js';

/**
 * 명령 사용 허용 화이트리스트(data/access.json).
 * { roles: [roleId...], users: [userId...] }  — 둘 다 ID(snowflake) 매칭.
 *  - 서버 관리자(ManageGuild)는 화이트리스트와 무관하게 항상 허용.
 *  - 시드/마이그레이션은 syncAccess(client)가 시작 시 처리(아래).
 */

const ACCESS_FILE = join(config.dataDir, 'access.json');
const isSnowflake = (s) => /^\d{17,20}$/.test(String(s));

export function loadAccess() {
  const a = readJSON(ACCESS_FILE, { roles: [], users: [] });
  if (!Array.isArray(a.roles)) a.roles = [];
  if (!Array.isArray(a.users)) a.users = [];
  return a;
}
function save(a) {
  writeJSON(ACCESS_FILE, a);
}

export function getRoles() {
  return loadAccess().roles;
}
export function getUsers() {
  return loadAccess().users;
}

export function addRole(roleId) {
  const a = loadAccess();
  if (a.roles.includes(roleId)) return false;
  a.roles.push(roleId);
  save(a);
  return true;
}
export function removeRole(roleId) {
  const a = loadAccess();
  const i = a.roles.indexOf(roleId);
  if (i < 0) return false;
  a.roles.splice(i, 1);
  save(a);
  return true;
}
export function addUser(id) {
  const a = loadAccess();
  if (a.users.includes(id)) return false;
  a.users.push(id);
  save(a);
  return true;
}
export function removeUser(id) {
  const a = loadAccess();
  const i = a.users.indexOf(id);
  if (i < 0) return false;
  a.users.splice(i, 1);
  save(a);
  return true;
}

/**
 * 시작 시 1회 호출(ClientReady). 멱등.
 * - 기존 roles에 '역할 이름'이 남아 있으면 길드에서 찾아 roleId로 변환(마이그레이션).
 * - access.json이 처음 생성되는 경우에만 config.adminRoleName을 roleId로 시드.
 * - 변환 못 한 이름(역할 삭제/이름변경)은 드롭.
 */
export function syncAccess(client) {
  const existed = existsSync(ACCESS_FILE);
  const a = loadAccess();

  const resolve = (nameOrId) => {
    if (isSnowflake(nameOrId)) return nameOrId; // 이미 ID
    for (const g of client.guilds.cache.values()) {
      const role = g.roles.cache.find((r) => r.name === nameOrId);
      if (role) return role.id;
    }
    return null; // 못 찾음 → 드롭
  };

  const roles = a.roles.map(resolve).filter(Boolean);
  if (!existed && config.adminRoleName) {
    const id = resolve(config.adminRoleName);
    if (id) roles.push(id);
  }
  a.roles = [...new Set(roles)];
  save(a);
  return a;
}
