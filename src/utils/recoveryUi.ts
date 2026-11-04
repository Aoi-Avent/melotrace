/**
 * 「クイック診断・アプリ復旧」モーダルの開閉を持つ小さなストア。
 * どの画面からでも openRecovery() で開ける（QuickRecoveryModal が購読して表示する）。
 * API消費: 0ユニット（YouTube Data APIは呼ばない）。
 */
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function openRecovery() {
  if (open) return;
  open = true;
  emit();
}

export function closeRecovery() {
  if (!open) return;
  open = false;
  emit();
}

export function useRecoveryOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open);
}
