// Text-channel command parser. Turkish aliases sit next to the usual English ones.

export type BotCommand =
  | { name: 'play'; query: string }
  | { name: 'skip' }
  | { name: 'stop' }
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'queue' }
  | { name: 'help' };

const ALIASES: Record<string, BotCommand['name']> = {
  play: 'play',
  p: 'play',
  çal: 'play',
  skip: 'skip',
  s: 'skip',
  next: 'skip',
  geç: 'skip',
  stop: 'stop',
  leave: 'stop',
  dur: 'stop',
  pause: 'pause',
  duraklat: 'pause',
  resume: 'resume',
  devam: 'resume',
  queue: 'queue',
  q: 'queue',
  sıra: 'queue',
  help: 'help',
  yardım: 'help',
};

/** "!play never gonna" → { name: 'play', query: 'never gonna' }. Unknown commands → null (ignored). */
export function parseCommand(content: string): BotCommand | null {
  const match = /^!(\S+)\s*([\s\S]*)$/u.exec(content.trim());
  if (!match) return null;
  const name = ALIASES[match[1].toLocaleLowerCase('tr-TR')];
  if (!name) return null;
  if (name === 'play') return { name, query: match[2].trim() };
  return { name };
}

export const HELP_TEXT = [
  '🎵 Müzik komutları',
  '!play <YouTube linki veya arama> — çal ya da sıraya ekle (!p, !çal)',
  '!play <çalma listesi linki> — listedeki tüm şarkıları sıraya ekle',
  '!pause — duraklat (!duraklat)   !resume — devam et (!devam)',
  '!skip — sıradakine geç (!geç)   !stop — durdur ve kanaldan ayrıl (!dur)',
  '!queue — sırayı göster (!sıra)',
].join('\n');
