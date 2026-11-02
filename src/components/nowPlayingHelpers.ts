export const formatTime = (sec: number) => {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatRemainingTime = (currentSec: number, durSec: number) => {
  const rem = Math.max(0, durSec - currentSec);
  return `\u2212${formatTime(rem)}`;
};

export const sheetBtn =
  'w-full px-3 py-3 text-[15px] text-left text-white rounded-xl hover:bg-white/10 active:bg-white/10 transition-colors font-medium flex items-center gap-3';
export const sheetChip = (on: boolean) =>
  `px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors active:scale-95 ${on ? 'bg-white text-black' : 'bg-white/12 text-white/85'}`;

/** YouTube サムネイルの候補（大きい順）。上から順に試す */
export const ytThumbChain = (id: string): string[] => [
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/hq720.jpg`,
  `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
];
