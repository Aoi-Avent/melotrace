import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from './PageHeader';
import { usePlayer } from '../context/PlayerContext';
import { MusicTrack } from '../types/music';
import { PlayLogRow, localDateString, readOldestPlayTs, readPlayLogPage } from '../utils/playLog';

/**
 * 再生履歴: 再生ログ（新しい順）＋ ログ開始前の分（lastPlayed、曲ごとに1行）。
 * API 消費: IndexedDB の読み出しのみ。YouTube Data API は呼ばない（0ユニット）。
 * ライブラリに無い曲（削除・非表示など）の行は表示しない。
 */
const PAGE = 60; // 表示の段階
const LOG_CHUNK = 120; // ログを1回に読む件数
const QUEUE_MAX = 100;

interface HistRow {
  key: string;
  kind: 'log' | 'pre';
  track: MusicTrack;
  group: string; // 見出し
  time?: string; // 'HH:mm'（ログ分のみ）
  dateText?: string; // ログ前の分は日付のみ
  radio?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function groupLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return '今日';
  if (date === yesterday) return '昨日';
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEK[new Date(y, m - 1, d).getDay()];
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}年`}${m}月${d}日(${wd})`;
}

/** lastPlayed 'YYYY-MM-DD HH:mm'（UTC）→ エポックms。壊れた値は null */
function parseLastPlayedUtc(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s.trim().replace(' ', 'T') + (s.trim().length <= 10 ? 'T00:00:00Z' : ':00Z'));
  return Number.isNaN(t) ? null : t;
}

export const PlayHistoryView: React.FC = () => {
  const { activeTracks, playTrack, albumArtFor, artworkSource } = usePlayer();
  const [logRows, setLogRows] = useState<PlayLogRow[]>([]);
  const [logDone, setLogDone] = useState(false);
  const [oldestTs, setOldestTs] = useState<number | null | undefined>(undefined); // undefined=読み込み前
  const [limit, setLimit] = useState(PAGE);
  const loadingRef = useRef(false);
  const lastTsRef = useRef<number | null>(null);

  // 最古の ts を先に読む（ログ前の分の境界）
  useEffect(() => {
    let alive = true;
    readOldestPlayTs().then((ts) => {
      if (!alive) return;
      setOldestTs(ts);
      if (ts == null) setLogDone(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const page = await readPlayLogPage(LOG_CHUNK, lastTsRef.current);
    if (page.length > 0) lastTsRef.current = page[page.length - 1].ts;
    setLogRows((prev) => prev.concat(page));
    if (page.length < LOG_CHUNK) setLogDone(true);
    loadingRef.current = false;
  }, []);

  const trackMap = useMemo(() => new Map(activeTracks.map((t) => [t.id, t])), [activeTracks]);

  const rows: HistRow[] = useMemo(() => {
    const now = new Date();
    const today = localDateString(now);
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yesterday = localDateString(y);
    const out: HistRow[] = [];
    for (const r of logRows) {
      const track = trackMap.get(r.trackId);
      if (!track) continue;
      out.push({
        key: `l${r.id ?? r.ts}`,
        kind: 'log',
        track,
        group: groupLabel(r.date, today, yesterday),
        time: `${pad(Math.floor(r.hour))}:${pad(new Date(r.ts).getMinutes())}`,
        radio: r.route === 'radio',
      });
    }
    // ログ前の分は、ログを読み切ってから（途中で混ざらないように）
    if (logDone && oldestTs !== undefined) {
      const pre: { track: MusicTrack; ts: number }[] = [];
      for (const t of activeTracks) {
        const ts = parseLastPlayedUtc(t.lastPlayed); // UTC として解釈
        if (ts == null) continue;
        if (oldestTs == null || ts < oldestTs) pre.push({ track: t, ts });
      }
      pre.sort((a, b) => b.ts - a.ts);
      for (const p of pre) {
        const d = new Date(p.ts);
        out.push({
          key: `p${p.track.id}`,
          kind: 'pre',
          track: p.track,
          group: 'ログ開始前',
          dateText: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
        });
      }
    }
    return out;
  }, [logRows, logDone, oldestTs, trackMap, activeTracks]);

  // 必要な分だけ先読み（表示予定の行数に足りなければログを追加で読む）
  useEffect(() => {
    if (oldestTs === undefined || logDone) return;
    if (rows.length < limit + PAGE) void loadMore();
  }, [oldestTs, logDone, rows.length, limit, loadMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const more = limit < rows.length || !logDone;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE);
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit, rows.length]);

  const shown = rows.slice(0, limit);

  const onTap = (idx: number) => {
    const queue = rows.slice(idx, idx + QUEUE_MAX).map((r) => r.track);
    playTrack(rows[idx].track, queue);
  };

  const loaded = oldestTs !== undefined;

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="再生履歴" onBack avatar={false} />
      {loaded && rows.length === 0 && logDone && <p className="text-[15px] text-muted mt-8 text-center">まだ再生履歴がありません</p>}
      <div className="mt-1">
        {shown.map((r, i) => {
          const album = artworkSource === 'album' ? albumArtFor(r.track.id) : null;
          return (
            <React.Fragment key={r.key}>
              {(i === 0 || shown[i - 1].group !== r.group) && <h2 className="text-[20px] font-bold text-fg mt-6 mb-1">{r.group}</h2>}
              <button onClick={() => onTap(i)} className="w-full flex items-center gap-3 py-2 text-left active:opacity-60 transition-opacity">
                <div className="w-12 h-12 rounded-md overflow-hidden bg-surface-2 shrink-0">
                  <img
                    src={album ? album.url : `https://img.youtube.com/vi/${r.track.id}/mqdefault.jpg`}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] text-fg truncate">{r.track.title}</p>
                  <p className="text-[14px] text-muted truncate">
                    {r.radio && <span className="text-[11px] mr-1.5 px-1 rounded border border-current opacity-80">ラジオ</span>}
                    {r.track.artist}
                  </p>
                </div>
                <span className="text-[13px] text-muted shrink-0 tabular-nums">{r.kind === 'log' ? r.time : r.dateText}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {more && <div ref={sentinelRef} className="h-10" />}
    </div>
  );
};
