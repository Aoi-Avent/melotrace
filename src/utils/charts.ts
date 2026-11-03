// 「人気の音楽（日本）」の棚で使う charts.json の読み込み。
// JSON は GitHub Actions が1日1回生成する（scripts/fetch-charts.mjs）。ブラウザからAPIは叩かない。
// 読めない・古い・壊れている場合は null を返し、棚は表示されない（アプリ全体には影響しない）。
import { useEffect, useState } from 'react';
import type { MusicTrack } from '../types/music';
import { normalizeName, splitArtistNames } from './textMatch';
import { buildCatalogTrack } from './videoToTrack';

interface ChartsFile {
  version: number;
  region: string;
  generatedAt: string;
  items: { id: string; title: string; artist: string; channelId?: string; duration?: number | null }[];
}

export interface ChartsData {
  generatedAt: string;
  tracks: MusicTrack[];
}

/** これより古いJSONは使わない（アプリ同梱のスナップショットが古くなった場合の保険） */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ITEMS = 3;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function toTrack(it: ChartsFile['items'][number]): MusicTrack {
  return buildCatalogTrack({ id: it.id, title: it.title, channelTitle: it.artist, channelId: it.channelId, durationSec: it.duration });
}

export async function loadCharts(): Promise<ChartsData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/charts.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html')) return null; // SPAのフォールバックHTMLが返ってきた場合
    const data = (await res.json()) as ChartsFile;
    const at = Date.parse(data?.generatedAt);
    if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return null;
    if (!Array.isArray(data.items)) return null;
    const items = data.items.filter((it) => it && VIDEO_ID.test(it.id) && typeof it.title === 'string');
    if (items.length < MIN_ITEMS) return null;
    return { generatedAt: data.generatedAt, tracks: items.map(toTrack) };
  } catch {
    return null;
  }
}

// 同じ起動中は1回だけ読み込む（ホームの棚とオンボーディングで共有）
let chartsPromise: Promise<ChartsData | null> | null = null;

export function useCharts(): ChartsData | null {
  const [charts, setCharts] = useState<ChartsData | null>(null);
  useEffect(() => {
    let alive = true;
    if (!chartsPromise) chartsPromise = loadCharts();
    chartsPromise.then((c) => {
      if (alive) setCharts(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return charts;
}

/** チャートの曲のうち、選んだ（お気に入りの）アーティストの曲だけを返す */
export function pickByArtists(tracks: MusicTrack[], artists: string[], max: number): MusicTrack[] {
  if (artists.length === 0) return [];
  const wanted = new Set(artists.map((a) => normalizeName(a)).filter(Boolean));
  const out: MusicTrack[] = [];
  for (const t of tracks) {
    if (splitArtistNames(t.artist || '').some((n) => wanted.has(normalizeName(n)))) {
      out.push(t);
      if (out.length >= max) break;
    }
  }
  return out;
}
