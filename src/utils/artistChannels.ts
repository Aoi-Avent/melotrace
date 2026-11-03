// お気に入りのアーティスト名 → YouTube チャンネル の対応。
// ・APIを使わずに自動で解決する順: (1) ライブラリの曲の channelId のうち最も多いもの (2) charts.json の曲の channelId
// ・自動で解決した結果は保存せず、毎回その場で計算する（ライブラリの変化に追従し、古い対応が残らない）
// ・利用者がURLを貼って連携した分だけ、端末内の localStorage に保存する（クラウド同期には含めない）。手動の連携が最優先
import { useCallback, useMemo, useState } from 'react';
import type { MusicTrack } from '../types/music';
import { normalizeName } from './textMatch';
import { findChannel } from './youtubeApi';
import { parseYoutubeTarget, UrlImportError } from './youtubeUrl';

export interface ArtistChannel {
  channelId: string;
  title: string;
}
export interface LinkedArtist extends ArtistChannel {
  /** お気に入りに入っているときの表記 */
  name: string;
}

const STORAGE_KEY = 'melotrace_artist_channels_v1';
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

function loadStored(): Record<string, ArtistChannel> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, ArtistChannel> = {};
    for (const [k, v] of Object.entries(data as Record<string, any>)) {
      if (v && typeof v.channelId === 'string' && CHANNEL_ID_RE.test(v.channelId)) {
        out[k] = { channelId: v.channelId, title: typeof v.title === 'string' ? v.title : '' };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveStored(map: Record<string, ArtistChannel>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* 容量超過などは無視（連携が保存されないだけ） */
  }
}

/** 曲の「アーティスト名（正規化）」が wanted に一致するものだけ、channelId を数える */
function countChannels(tracks: MusicTrack[], wanted: Set<string>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const t of tracks) {
    if (!t.channelId || !CHANNEL_ID_RE.test(t.channelId)) continue;
    const key = normalizeName(t.artist || '');
    if (!wanted.has(key)) continue;
    let m = out.get(key);
    if (!m) out.set(key, (m = new Map()));
    m.set(t.channelId, (m.get(t.channelId) ?? 0) + 1);
  }
  return out;
}

function mostCommon(m: Map<string, number> | undefined): string | null {
  if (!m) return null;
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of m) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

export function useArtistChannels(favoriteArtists: string[], library: MusicTrack[], chartTracks: MusicTrack[]) {
  const [stored, setStored] = useState<Record<string, ArtistChannel>>(loadStored);

  const { linked, unresolved } = useMemo(() => {
    const names = new Map<string, string>(); // 正規化名 → 表記
    for (const a of favoriteArtists) {
      const k = normalizeName(a);
      if (k && !names.has(k)) names.set(k, a);
    }
    const wanted = new Set(names.keys());
    const needAuto = new Set([...wanted].filter((k) => !stored[k]));
    const fromLibrary = needAuto.size ? countChannels(library, needAuto) : new Map<string, Map<string, number>>();
    const fromCharts = needAuto.size ? countChannels(chartTracks, needAuto) : new Map<string, Map<string, number>>();

    const linked: LinkedArtist[] = [];
    const unresolved: string[] = [];
    for (const [k, name] of names) {
      const manual = stored[k];
      if (manual) {
        linked.push({ name, channelId: manual.channelId, title: manual.title || name });
        continue;
      }
      const id = mostCommon(fromLibrary.get(k)) ?? mostCommon(fromCharts.get(k));
      if (id) linked.push({ name, channelId: id, title: name });
      else unresolved.push(name);
    }
    return { linked, unresolved };
  }, [favoriteArtists, library, chartTracks, stored]);

  const link = useCallback((name: string, ch: ArtistChannel) => {
    const k = normalizeName(name);
    if (!k) return;
    setStored((prev) => {
      const next = { ...prev, [k]: ch };
      saveStored(next);
      return next;
    });
  }, []);

  return { linked, unresolved, link };
}

/**
 * 貼られたURL/@ハンドルからチャンネルを確定する。
 * API消費の見積もり: channelId のURLは 0ユニット、@ハンドル/旧ユーザー名は channels.list を1回で 1ユニット。
 * 失敗時は、利用者に見せられる文言の Error を投げる。
 */
export async function resolveChannelInput(raw: string, fallbackTitle: string): Promise<ArtistChannel> {
  let target;
  try {
    target = parseYoutubeTarget(raw);
  } catch (e) {
    throw new Error(e instanceof UrlImportError ? e.message : 'URLを読み取れませんでした。');
  }
  if (target.kind === 'playlist') throw new Error('プレイリストではなく、チャンネルのURLを貼ってください。');
  if (target.kind === 'channelId') return { channelId: target.channelId, title: fallbackTitle };

  try {
    const ch = await findChannel(target.kind === 'handle' ? { handle: target.handle } : { username: target.username });
    if (!ch) throw new Error('チャンネルが見つかりませんでした。');
    return { channelId: ch.id, title: ch.title || fallbackTitle };
  } catch (e) {
    if (e instanceof Error && e.name !== 'YoutubeApiError') throw e;
    console.warn('[artistChannels] findChannel failed', e);
    throw new Error('チャンネルを確認できませんでした。時間をおいて試してください。');
  }
}
