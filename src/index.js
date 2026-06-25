import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  ApplicationCommandOptionType,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { config } from './config.js';
import { buildBoard, buildSummary, buildHelp } from './order-board.js';
import {
  recordToSession,
  createSession,
  getActiveSession,
  finalizeActive,
  activeChannelIds,
  setBoardMessage,
  setThread,
  loadSession,
  todayKST,
  kstWeekday,
  kstMinutes,
} from './store.js';
import {
  isManaged,
  getTrigger,
  setTrigger,
  clearTrigger,
  addChannel,
  removeChannel,
  getChannelIds,
  getChannelConfig,
  setMenu,
  getMenu,
} from './channels.js';
import { loadAccess, syncAccess, addRole, removeRole, getRoles, addUser, removeUser, getUsers } from './access.js';
import { rebuildScheduler } from './scheduler.js';
import { log } from './logger.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const T = ApplicationCommandOptionType;
const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const CAFE_COMMAND = {
  name: 'cafe',
  description: '커피 주문 세션 관리',
  dm_permission: false, // DM 노출/실행 차단(길드 전용)
  ...(config.adminRoleName ? {} : { default_member_permissions: PermissionFlagsBits.ManageGuild.toString() }),
  options: [
    { type: T.Subcommand, name: 'help', description: '명령어 도움말 보기' },
    { type: T.Subcommand, name: 'open', description: '이 채널의 주문 세션을 지금 엽니다' },
    { type: T.Subcommand, name: 'close', description: '이 채널의 세션을 마감하고 종합을 게시합니다' },
    { type: T.Subcommand, name: 'status', description: '이 채널의 세션 상태를 확인합니다' },
    {
      type: T.SubcommandGroup,
      name: 'trigger',
      description: '이 채널의 자동 트리거 관리',
      options: [
        {
          type: T.Subcommand,
          name: 'set',
          description: '자동 트리거 설정/수정 (채널당 1개)',
          options: [
            { type: T.String, name: 'open', description: '게시 시각 HH:MM (기본 11:15)' },
            { type: T.String, name: 'close', description: '마감 시각 HH:MM (기본 11:30)' },
            { type: T.String, name: 'days', description: '요일: 평일/매일/주말 또는 0-6 콤마 (기본 평일)' },
          ],
        },
        { type: T.Subcommand, name: 'off', description: '이 채널의 자동 트리거 제거' },
        { type: T.Subcommand, name: 'show', description: '이 채널의 트리거 확인' },
      ],
    },
    {
      type: T.SubcommandGroup,
      name: 'channel',
      description: '봇 운영 채널 관리',
      options: [
        { type: T.Subcommand, name: 'add', description: '이 채널을 봇 운영 채널로 등록' },
        { type: T.Subcommand, name: 'remove', description: '이 채널을 운영 채널에서 해제' },
        { type: T.Subcommand, name: 'list', description: '운영 채널 목록 보기' },
      ],
    },
    {
      type: T.SubcommandGroup,
      name: 'menu',
      description: '이 채널의 메뉴(선택지) 관리',
      options: [
        {
          type: T.Subcommand,
          name: 'set',
          description: '메뉴 설정 (콤마로 구분, 이모지 자동)',
          options: [{ type: T.String, name: 'items', description: '예: 아메리카노, 라떼, 아이스티', required: true }],
        },
        { type: T.Subcommand, name: 'show', description: '현재 메뉴 보기' },
        { type: T.Subcommand, name: 'reset', description: '기본 메뉴로 되돌리기' },
      ],
    },
    {
      type: T.SubcommandGroup,
      name: 'role',
      description: '명령 사용 허용 역할 관리 (서버 관리자만)',
      options: [
        {
          type: T.Subcommand,
          name: 'add',
          description: '허용 역할 추가',
          options: [{ type: T.Role, name: 'role', description: '허용할 역할', required: true }],
        },
        {
          type: T.Subcommand,
          name: 'remove',
          description: '허용 역할 제거',
          options: [{ type: T.Role, name: 'role', description: '제거할 역할', required: true }],
        },
        { type: T.Subcommand, name: 'list', description: '허용 역할 목록' },
      ],
    },
    {
      type: T.SubcommandGroup,
      name: 'user',
      description: '명령 사용 허용 유저 관리 (서버 관리자만)',
      options: [
        {
          type: T.Subcommand,
          name: 'add',
          description: '허용 유저 추가',
          options: [{ type: T.User, name: 'user', description: '허용할 유저', required: true }],
        },
        {
          type: T.Subcommand,
          name: 'remove',
          description: '허용 유저 제거',
          options: [{ type: T.User, name: 'user', description: '제거할 유저', required: true }],
        },
        { type: T.Subcommand, name: 'list', description: '허용 유저 목록' },
      ],
    },
  ],
};

function resolveDisplayName(interaction) {
  const m = interaction.member;
  if (m) {
    if (typeof m.displayName === 'string' && m.displayName) return m.displayName;
    if (typeof m.nick === 'string' && m.nick) return m.nick;
  }
  return interaction.user.globalName || interaction.user.username;
}

async function isAllowed(interaction) {
  if (!interaction.inGuild()) return false; // 길드 외(DM)는 거부 — fail-closed
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const { roles, users } = loadAccess();
  if (users.includes(interaction.user.id)) return true;
  // @everyone(=길드ID)은 화이트리스트로 인정하지 않음(전체 개방 방지)
  const allowRoles = roles.filter((id) => id !== interaction.guildId);
  if (!allowRoles.length) return false;
  let member = interaction.member;
  if (!member?.roles?.cache) {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      return false;
    }
  }
  return allowRoles.some((id) => member.roles?.cache?.has(id) ?? false);
}

async function getChannel(channelId) {
  const ch = await client.channels.fetch(channelId);
  if (!ch || !ch.isTextBased()) {
    throw new Error(`채널 ${channelId}를 찾을 수 없거나 텍스트 채널이 아닙니다(봇 초대/권한 확인).`);
  }
  return ch;
}

async function postThreadLog(threadId, name, menu, changed) {
  if (!threadId) return;
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread || typeof thread.send !== 'function') return;
    await thread.send(`**${name}** → ${menu.emoji} ${menu.label}${changed ? ' (변경)' : ''}`);
  } catch (e) {
    log.warn('스레드 로그 실패', { error: e.message });
  }
}

/** 채널의 주문 세션 열기(멱등). @return {{opened:boolean, reason?:'already', session:object}} */
async function openSession(channelId, { manual = false } = {}) {
  const active = getActiveSession(channelId);
  if (active) {
    log.info('세션 이미 열림 — 열기 생략', { channelId, sessionId: active.id });
    return { opened: false, reason: 'already', session: active };
  }
  const session = createSession(channelId, { manual }); // 채널 메뉴 스냅샷 포함
  const ch = await getChannel(channelId);
  const msg = await ch.send(buildBoard({ session }));
  setBoardMessage(session.id, msg.id);

  if (config.logToThread) {
    try {
      const thread = await msg.startThread({
        name: `☕ 주문 현황 ${session.date} ${session.id.split('_').pop()}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      });
      setThread(session.id, thread.id);
      await thread.send('주문이 들어오면 여기에 실시간으로 기록됩니다. (마감 전까지 변경 가능)');
    } catch (e) {
      log.warn("스레드 생성 실패('Create Public Threads' 권한 확인)", { channelId, error: e.message });
    }
  }
  log.info('세션 열림', { channelId, sessionId: session.id, messageId: msg.id });
  return { opened: true, session };
}

/** 채널의 활성 세션 마감. */
async function closeSession(channelId) {
  const active = getActiveSession(channelId);
  if (!active) {
    log.info('열린 세션 없어 마감 생략', { channelId });
    return { closed: false, reason: 'no-session' };
  }
  const s = finalizeActive(channelId);
  if (!s) {
    log.warn('활성 세션 파일을 찾을 수 없어 마감 생략(포인터만 해제)', { channelId });
    return { closed: false, reason: 'no-session' };
  }
  if (!s._didFinalize) {
    // 다른 경로(매분 체커·수동 close·부팅복구)가 이미 마감 → 종합 중복 게시 방지(멱등)
    log.info('이미 마감된 세션 — 종합 재게시 생략', { channelId, sessionId: s.id });
    return { closed: false, reason: 'already' };
  }
  const ch = await getChannel(channelId);

  if (s.boardMessageId) {
    try {
      const msg = await ch.messages.fetch(s.boardMessageId);
      await msg.edit(buildBoard({ session: s, disabled: true }));
    } catch (e) {
      log.warn('주문판 비활성화 실패(삭제됐을 수 있음)', { channelId, error: e.message });
    }
  }
  await ch.send(buildSummary(s));

  if (config.logToThread && s.threadId) {
    try {
      const thread = await client.channels.fetch(s.threadId);
      if (thread && typeof thread.send === 'function') {
        await thread.send('🔒 주문이 마감되었습니다.');
        if (typeof thread.setArchived === 'function') await thread.setArchived(true);
      }
    } catch (e) {
      log.warn('스레드 마감 처리 실패', { channelId, error: e.message });
    }
  }
  log.info('세션 마감 + 종합 게시', { channelId, sessionId: s.id, orders: Object.keys(s.orders).length });
  return { closed: true };
}

// 자동 트리거 핸들러(스케줄러가 호출)
const onOpen = (channelId) => openSession(channelId, { manual: false }).catch((e) => log.error('자동 세션 열기 오류', e));
const onCloseCheck = () => closeDueSessions().catch((e) => log.error('마감 체크 오류', e));

/** 활성 세션 중 마감 예정(closeAt) 시각이 지난 것을 마감. 스케줄러가 매 분 호출. */
async function closeDueSessions() {
  const now = Date.now();
  // 등록 해제된 채널에 남은 활성 세션도 마감하도록 state의 활성 채널까지 포함
  const ids = new Set([...getChannelIds(), ...activeChannelIds()]);
  for (const channelId of ids) {
    const s = getActiveSession(channelId);
    if (s && s.closeAt && Date.parse(s.closeAt) <= now) {
      log.info('마감 시각 도달 → 마감', { channelId, sessionId: s.id });
      await closeSession(channelId);
    }
  }
}

async function registerCommands(c) {
  try {
    for (const guild of c.guilds.cache.values()) {
      await guild.commands.set([CAFE_COMMAND]);
    }
    log.info('슬래시 커맨드 /cafe 등록', { guilds: c.guilds.cache.size });
  } catch (e) {
    log.error("슬래시 커맨드 등록 실패 — 봇 초대 시 'applications.commands' 스코프 필요", e);
  }
}

/** 부팅 복구: 트리거가 있는 채널마다 놓친 게시/마감을 채널별 시각으로 보정. */
async function recoverIfNeeded() {
  const nowMs = Date.now();
  const nowMin = kstMinutes();
  const ids = new Set([...getChannelIds(), ...activeChannelIds()]);
  for (const channelId of ids) {
    try {
      let active = getActiveSession(channelId);
      // 1) 마감 예정(closeAt) 지난 활성 세션 마감 — 수동/트리거 공통
      if (active && active.closeAt && Date.parse(active.closeAt) <= nowMs) {
        log.info('부팅 복구: 마감 예정 지난 세션 마감', { channelId, sessionId: active.id });
        await closeSession(channelId);
        active = getActiveSession(channelId);
      }
      // 2) 트리거 채널이고 게시 시간대인데 활성 세션이 없으면 게시
      const tr = getTrigger(channelId);
      if (!active && tr) {
        const [oh, om] = String(tr.openHM).split(':').map(Number);
        const [ch, cm] = String(tr.closeHM).split(':').map(Number);
        const openMin = oh * 60 + om;
        const closeMin = ch * 60 + cm;
        const isWeekday = (tr.weekdays && tr.weekdays.length ? tr.weekdays : [1, 2, 3, 4, 5]).includes(kstWeekday());
        if (isWeekday && nowMin >= openMin && nowMin < closeMin) {
          log.info('부팅 복구: 트리거 게시 시간대 → 게시', { channelId });
          await openSession(channelId, { manual: false });
        }
      }
    } catch (e) {
      log.error('부팅 복구 오류', e);
    }
  }
}

// ---- 트리거 인자 파싱 ----
function parseDays(s) {
  const t = String(s || '').trim();
  if (!t || t === '평일') return [1, 2, 3, 4, 5];
  if (t === '매일') return [0, 1, 2, 3, 4, 5, 6];
  if (t === '주말') return [0, 6];
  const arr = t
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return arr.length ? Array.from(new Set(arr)) : [1, 2, 3, 4, 5];
}
function validHM(s) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s || '').trim());
}
function daysLabel(days) {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return days.map((d) => names[d]).join('');
}

/** /cafe 슬래시 커맨드 처리. */
async function handleCafeCommand(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: '이 명령은 서버 채널에서만 사용할 수 있어요.', flags: MessageFlags.Ephemeral });
  }
  if (!(await isAllowed(interaction))) {
    const who = config.adminRoleName ? `서버 관리자 또는 \`${config.adminRoleName}\` 역할 멤버` : '서버 관리자';
    await interaction.reply({ content: `${who}만 사용할 수 있어요.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  // 등록 채널이어야 하는 명령: open/close/status, trigger off/show
  const needManaged =
    (group === null && sub !== 'help') ||
    (group === 'trigger' && (sub === 'off' || sub === 'show')) ||
    group === 'menu';
  if (needManaged && !isManaged(channelId)) {
    await interaction.reply({
      content: '이 채널은 봇 운영 채널이 아니에요. `/cafe channel add` 또는 `/cafe trigger set`으로 등록하세요.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  log.info('슬래시 커맨드', { group, sub, channelId, by: resolveDisplayName(interaction) });

  // ---- 도움말 ----
  if (group === null && sub === 'help') {
    return interaction.editReply(buildHelp({ managed: isManaged(channelId), trigger: getTrigger(channelId) }));
  }

  // ---- 세션 명령 ----
  if (group === null && sub === 'open') {
    const r = await openSession(channelId, { manual: true });
    return interaction.editReply(r.opened ? '✅ 주문 세션을 열었어요. (자동 열기는 생략됩니다)' : 'ℹ️ 이미 열린 세션이 있어요.');
  }
  if (group === null && sub === 'close') {
    const r = await closeSession(channelId);
    if (r.closed) return interaction.editReply('✅ 세션을 마감하고 종합을 게시했어요.');
    return interaction.editReply(
      r.reason === 'already' ? 'ℹ️ 이미 마감됐어요. (종합은 위에 게시됨)' : 'ℹ️ 마감할 세션이 없어요.'
    );
  }
  if (group === null && sub === 'status') {
    const a = getActiveSession(channelId);
    const tr = getTrigger(channelId);
    const trLine = tr ? `트리거 ${tr.openHM}~${tr.closeHM} [${daysLabel(tr.weekdays)}]` : '트리거 없음(수동)';
    return interaction.editReply(
      (a ? `📋 열림 · 주문 ${Object.keys(a.orders).length}명` : '📋 열린 세션 없음') + ` · ${trLine}`
    );
  }

  // ---- 트리거 명령 ----
  if (group === 'trigger' && sub === 'set') {
    const cur = getTrigger(channelId); // 기존 트리거 있으면 미입력 필드는 기존값 유지(부분 수정)
    const open = (interaction.options.getString('open') || cur?.openHM || '11:15').trim();
    const close = (interaction.options.getString('close') || cur?.closeHM || '11:30').trim();
    const daysOpt = interaction.options.getString('days');
    const days = daysOpt ? parseDays(daysOpt) : cur?.weekdays || [1, 2, 3, 4, 5];
    if (!validHM(open) || !validHM(close)) {
      return interaction.editReply('⛔ 시간 형식은 HH:MM 이어야 해요 (예: 11:15).');
    }
    const toMin = (s) => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };
    if (toMin(close) <= toMin(open)) {
      return interaction.editReply('⛔ 마감 시각은 게시 시각보다 뒤여야 해요. (자정 넘김은 지원하지 않아요)');
    }
    setTrigger(channelId, { openHM: open, closeHM: close, weekdays: days });
    rebuildScheduler({ onOpen, onCloseCheck });
    return interaction.editReply(`✅ 트리거 설정 — [${daysLabel(days)}] ${open} 게시 / ${close} 마감`);
  }
  if (group === 'trigger' && sub === 'off') {
    clearTrigger(channelId);
    rebuildScheduler({ onOpen, onCloseCheck });
    return interaction.editReply('✅ 이 채널의 자동 트리거를 제거했어요. (수동 open/close만)');
  }
  if (group === 'trigger' && sub === 'show') {
    const tr = getTrigger(channelId);
    return interaction.editReply(
      tr ? `🕒 [${daysLabel(tr.weekdays)}] ${tr.openHM} 게시 / ${tr.closeHM} 마감` : '🕒 자동 트리거가 없어요(수동 전용).'
    );
  }

  // ---- 채널 명령 ----
  if (group === 'channel' && sub === 'add') {
    addChannel(channelId);
    rebuildScheduler({ onOpen, onCloseCheck });
    return interaction.editReply('✅ 이 채널을 봇 운영 채널로 등록했어요. 트리거는 `/cafe trigger set`으로 켜세요.');
  }
  if (group === 'channel' && sub === 'remove') {
    const existed = removeChannel(channelId);
    rebuildScheduler({ onOpen, onCloseCheck });
    return interaction.editReply(existed ? '✅ 이 채널을 운영 채널에서 해제했어요.' : 'ℹ️ 등록돼 있지 않은 채널이에요.');
  }
  if (group === 'channel' && sub === 'list') {
    const ids = getChannelIds();
    if (!ids.length) return interaction.editReply('운영 채널이 없어요.');
    const lines = ids.map((id) => {
      const c = getChannelConfig(id);
      const tr = c?.trigger;
      return `• <#${id}> — ${tr ? `${tr.openHM}~${tr.closeHM}[${daysLabel(tr.weekdays)}]` : '수동'}`;
    });
    return interaction.editReply('📋 운영 채널\n' + lines.join('\n'));
  }

  // ---- 메뉴 명령 ----
  if (group === 'menu' && sub === 'set') {
    const labels = (interaction.options.getString('items') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length < 1 || labels.length > 10) {
      return interaction.editReply('⛔ 메뉴는 1~10개여야 해요 (콤마로 구분).');
    }
    if (labels.some((l) => l.length > 55)) {
      return interaction.editReply('⛔ 각 항목은 55자 이하여야 해요.');
    }
    const menu = labels.map((label, i) => ({ emoji: KEYCAPS[i], label }));
    setMenu(channelId, menu);
    return interaction.editReply('✅ 이 채널 메뉴 설정:\n' + menu.map((m) => `${m.emoji} ${m.label}`).join('\n'));
  }
  if (group === 'menu' && sub === 'show') {
    const menu = getMenu(channelId);
    const custom = !!getChannelConfig(channelId)?.menu;
    return interaction.editReply(
      `${custom ? '이 채널 전용 메뉴' : '기본 메뉴(config)'}:\n` + menu.map((m) => `${m.emoji} ${m.label}`).join('\n')
    );
  }
  if (group === 'menu' && sub === 'reset') {
    setMenu(channelId, null);
    return interaction.editReply('✅ 이 채널 메뉴를 기본값으로 되돌렸어요.');
  }

  // ---- 권한 화이트리스트(역할/유저) — 서버 관리자만 ----
  if (group === 'role' || group === 'user') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.editReply('🔒 역할/유저 화이트리스트는 **서버 관리자**만 관리할 수 있어요.');
    }
    if (group === 'role' && sub === 'add') {
      const role = interaction.options.getRole('role');
      if (role.id === interaction.guildId) {
        return interaction.editReply('⚠️ `@everyone`은 추가할 수 없어요(전체 개방 방지).');
      }
      return interaction.editReply(addRole(role.id) ? `✅ 허용 역할 추가: ${role}` : `ℹ️ 이미 허용된 역할이에요: ${role}`);
    }
    if (group === 'role' && sub === 'remove') {
      const role = interaction.options.getRole('role');
      return interaction.editReply(removeRole(role.id) ? `✅ 허용 역할 제거: ${role}` : `ℹ️ 목록에 없던 역할이에요: ${role}`);
    }
    if (group === 'role' && sub === 'list') {
      const roles = getRoles();
      return interaction.editReply(roles.length ? '🛡️ 허용 역할: ' + roles.map((id) => `<@&${id}>`).join(', ') : '🛡️ 허용 역할 없음 (관리자만 사용 가능).');
    }
    if (group === 'user' && sub === 'add') {
      const user = interaction.options.getUser('user');
      return interaction.editReply(addUser(user.id) ? `✅ 허용 유저 추가: <@${user.id}>` : `ℹ️ 이미 허용된 유저예요: <@${user.id}>`);
    }
    if (group === 'user' && sub === 'remove') {
      const user = interaction.options.getUser('user');
      return interaction.editReply(removeUser(user.id) ? `✅ 허용 유저 제거: <@${user.id}>` : `ℹ️ 목록에 없던 유저예요: <@${user.id}>`);
    }
    if (group === 'user' && sub === 'list') {
      const users = getUsers();
      return interaction.editReply(users.length ? '👤 허용 유저: ' + users.map((u) => `<@${u}>`).join(', ') : '👤 허용 유저 없음.');
    }
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'cafe') await handleCafeCommand(interaction);
      return;
    }

    if (!interaction.isButton() || !interaction.customId.startsWith('order:')) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts = interaction.customId.split(':'); // order : sessionId : idx
    const sessionId = parts[1];
    const idx = Number(parts[2]);
    const session = loadSession(sessionId);
    const menu = session?.menu?.[idx];
    if (!session || !menu) {
      await interaction.editReply('⛔ 세션을 찾을 수 없거나 메뉴가 올바르지 않아요.');
      return;
    }

    const name = resolveDisplayName(interaction);
    const res = recordToSession(sessionId, interaction.user.id, name, idx);

    let text;
    if (res.ok && res.unchanged) {
      text = `✅ 이미 **${menu.label}**(으)로 주문돼 있어요.`;
    } else if (res.ok) {
      text =
        `✅ **${menu.label}**(으)로 주문됐어요.` +
        (config.lockOnFirstChoice ? '' : ' 마감 전까지 다시 눌러 바꿀 수 있어요.');
    } else if (res.reason === 'closed') {
      text = '⛔ 이미 마감된 주문입니다.';
    } else if (res.reason === 'locked') {
      const prev = session.menu[res.existing.choice];
      text = `🔒 이미 **${prev ? prev.label : '?'}**(으)로 주문하셨어요. 변경할 수 없습니다.`;
    } else {
      text = '주문 처리 중 문제가 발생했어요.';
    }

    await interaction.editReply(text);

    if (res.ok && !res.unchanged) {
      log.info('주문', { sessionId, name, menu: menu.label, changed: !!res.changed });
      if (config.logToThread) postThreadLog(session.threadId, name, menu, res.changed).catch(() => {});
    }
  } catch (e) {
    log.error('인터랙션 처리 오류', e);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
      } else if (interaction.isRepliable()) {
        await interaction.reply({ content: '오류가 발생했어요. 잠시 후 다시 시도해 주세요.', flags: MessageFlags.Ephemeral });
      }
    } catch (_) {
      /* 응답 실패면 끝 */
    }
  }
});

client.once(Events.ClientReady, async (c) => {
  log.info('로그인 완료', { tag: c.user.tag, channels: getChannelIds().length });
  syncAccess(c); // 역할 이름→ID 마이그레이션 + adminRoleName 시드(최초)
  await registerCommands(c);
  try {
    await recoverIfNeeded();
  } catch (e) {
    log.error('부팅 복구 오류', e);
  }
  rebuildScheduler({ onOpen, onCloseCheck });
});

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) log.error('unhandledRejection', reason);
  else log.error('unhandledRejection', { reason: String(reason) });
});
process.on('uncaughtException', (err) => log.error('uncaughtException', err));

client.login(config.token);
