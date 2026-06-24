import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config } from './config.js';

/**
 * 주문 버튼판. 세션에 스냅샷된 menu를 사용하고, customId에 세션 id를 박아 격리한다.
 * @param {{session:object, disabled?:boolean}} opts
 */
export function buildBoard({ session, disabled = false }) {
  const menu = session.menu;
  const embed = new EmbedBuilder()
    .setTitle(config.title)
    .setDescription(disabled ? '🔒 주문이 마감되었습니다.' : config.description)
    .setColor(0xc8956d);

  const rows = [];
  let row = new ActionRowBuilder();
  menu.forEach((m, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`order:${session.id}:${i}`)
        .setLabel(m.label)
        .setEmoji(m.emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  });
  rows.push(row);

  return { embeds: [embed], components: rows };
}

/** 마감 종합: 세션 메뉴 기준 인원 + 주문자(별명). 0명이면 안내. */
export function buildSummary(session) {
  const menu = session.menu;
  const byChoice = menu.map(() => []);
  for (const o of Object.values(session.orders)) {
    if (byChoice[o.choice]) byChoice[o.choice].push(o.name);
  }
  const total = Object.keys(session.orders).length;

  let description;
  if (total === 0) {
    description = '오늘은 주문이 없었어요.';
  } else {
    description = menu
      .map((m, i) => {
        const names = byChoice[i];
        const head = `${m.emoji} **${m.label}** — ${names.length}잔`;
        return names.length ? `${head}\n　└ ${names.join(', ')}` : head;
      })
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setTitle('☕ 커피 주문 종합 (마감)')
    .setDescription(description)
    .setFooter({ text: `총 ${total}명 주문 · ${session.date}` })
    .setColor(0x6d4c41);

  return { embeds: [embed] };
}

/** /cafe help 임베드. 명령·옵션·예시 + 현재 채널 상태. */
export function buildHelp({ managed, trigger }) {
  const embed = new EmbedBuilder()
    .setTitle('☕ /cafe 명령어 도움말')
    .setColor(0xc8956d)
    .addFields(
      {
        name: '📋 세션 (수동)',
        value: '`/cafe open` — 주문 세션 열기\n`/cafe close` — 마감 + 종합 게시\n`/cafe status` — 현재 상태',
      },
      {
        name: '🕒 자동 트리거',
        value: '`/cafe trigger set` — 설정/수정\n`/cafe trigger off` — 끄기(수동만)\n`/cafe trigger show` — 확인',
      },
      {
        name: '#️⃣ 채널 관리',
        value: '`/cafe channel add` — 이 채널 등록\n`/cafe channel remove` — 해제\n`/cafe channel list` — 운영 채널 목록',
      },
      {
        name: '🍹 메뉴(선택지)',
        value:
          '`/cafe menu set items:아메리카노, 라떼, 아이스티` — 설정(이모지 자동)\n' +
          '`/cafe menu show` — 현재 메뉴\n`/cafe menu reset` — 기본으로',
      },
      {
        name: '⚙️ `trigger set` 옵션',
        value:
          '• `open` — 게시 시각 `HH:MM` (예: `11:15`)\n' +
          '• `close` — 마감 시각 `HH:MM` (예: `11:30`)\n' +
          '• `days` — `평일` · `매일` · `주말` · 숫자 콤마(`0`=일 … `6`=토, 예: `1,2,3`)\n' +
          '　※ 일부만 입력하면 나머지는 기존값 유지',
      },
      {
        name: '📝 예시',
        value: '`/cafe trigger set open:11:15 close:11:30 days:평일`',
      }
    )
    .setFooter({
      text: `이 채널: ${managed ? '운영 채널' : '미등록'} · ${
        trigger ? `트리거 ${trigger.openHM}~${trigger.closeHM}` : '트리거 없음(수동)'
      }`,
    });

  return { embeds: [embed] };
}
