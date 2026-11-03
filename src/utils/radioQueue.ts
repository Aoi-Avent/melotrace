// ラジオのキュー操作の純関数。PlayerContext には依存しない（APIも呼ばない＝追加のユニット消費は0）。
import type { MusicTrack } from '../types/music';

/** 補充する条件: キューの残りがこの曲数以下になったら補充する（補充条件はここだけで決める） */
export const RADIO_REFILL_REMAINING = 3;

/** 残り曲数が RADIO_REFILL_REMAINING 以下なら true */
export function isRadioRefillDue(queueLength: number, queueIndex: number): boolean {
  return queueLength - 1 - queueIndex <= RADIO_REFILL_REMAINING;
}

/**
 * 現在の曲（index）より後ろをラジオの曲だけに置き換える。現在の曲と、それより前の履歴は残す。
 * 追加できる曲が1曲もなければ、元の配列をそのまま返す（失敗時に、いまのキューを消さないため）。
 */
export function replaceUpcomingWithRadio(queue: MusicTrack[], index: number, batch: MusicTrack[]): MusicTrack[] {
  const ci = Math.max(-1, Math.min(index, queue.length - 1));
  const head = queue.slice(0, ci + 1);
  const seen = new Set(head.map((t) => t.id));
  const fresh: MusicTrack[] = [];
  for (const t of batch) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    fresh.push(t.isRadio ? t : { ...t, isRadio: true });
  }
  return fresh.length === 0 ? queue : [...head, ...fresh];
}

/** 次の曲をシャッフルで選ぶか。ラジオ中は設定にかかわらず順番どおり。ラジオ終了後は設定どおり */
export function shouldShuffleNext(isShuffle: boolean, radioActive: boolean): boolean {
  return isShuffle && !radioActive;
}
