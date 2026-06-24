import { join } from 'node:path';
import { config } from './config.js';
import { readJSON, writeJSON } from './util.js';

/**
 * 명령 사용 허용 화이트리스트(data/access.json).
 * { roles: [역할이름...], users: [userId...] }
 *  - 서버 관리자(ManageGuild)는 화이트리스트와 무관하게 항상 허용
 *  - roles: 역할 이름 매칭(슬래시 role 옵션의 role.name)
 *  - users: userId 매칭(슬래시 user 옵션의 user.id)
 * config.adminRoleName이 있으면 최초 시드로 roles에 들어간다.
 */

const ACCESS_FILE = join(config.dataDir, 'access.json');

export function loadAccess() {
  let a = readJSON(ACCESS_FILE, null);
  if (!a) {
    a = { roles: config.adminRoleName ? [config.adminRoleName] : [], users: [] };
    writeJSON(ACCESS_FILE, a);
  }
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

export function addRole(name) {
  const a = loadAccess();
  if (a.roles.includes(name)) return false;
  a.roles.push(name);
  save(a);
  return true;
}
export function removeRole(name) {
  const a = loadAccess();
  const i = a.roles.indexOf(name);
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
