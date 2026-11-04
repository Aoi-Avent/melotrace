import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from './PageHeader';
import { usePlayer } from '../context/PlayerContext';
import type { MusicTrack } from '../types/music';
import { readOldestPlayTs, readPlayLog, readPlayLogYear, PlayLogRow } from '../utils/playLog';
import { buildYearReview, collectTrackYears, DEFAULT_TRACK_SEC, YearReview } from '../utils/yearReview';

/**
 * 年間まとめ: 横スワイプ（CSS scroll-snap）のカード。
 * API 消費: IndexedDB の読み出しのみ（画面を開いたときと年を変えたときだけ）。YouTube API は呼ばない（0ユニット）。
 */
const CARD = 'w-full shrink-0 snap-center snap-always rounded-3xl bg-surface-2 p-5 h-[470px] overflow-y-auto flex flex-col';

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h <= 0) return `${m}分`;
  return m === 60 ? `${h + 1}時間0分` : `${h}時間${m}分`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}年${m}月${day}日`;
}

export const YearReviewView: React.FC = () => {
  const { musicTracks, albumArtFor, artworkSource } = usePlayer();
  const thisYear = new Date().getFullYear();

  const [logYears, setLogYears] = useState<number[] | null>(null); // null=読み込み前
  const [year, setYear] = useState<number | null>(null);
  const [rows, setRows] = useState<PlayLogRow[] | null>(null);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 画面を開いたとき: ログにある年の範囲（最古〜最新）を読む
  useEffect(() => {
    let alive = true;
    (async () => {
      const [oldest, newest] = await Promise.all([readOldestPlayTs(), readPlayLog(1)]);
      if (!alive) return;
      const ys: number[] = [];
      if (oldest != null && newest.length > 0) {
        for (let y = new Date(oldest).getFullYear(); y <= new Date(newest[0].ts).getFullYear(); y++) ys.push(y);
      }
      setLogYears(ys);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const years = useMemo(() => {
    if (logYears == null) return [] as number[];
    const set = new Set<number>([...logYears, ...collectTrackYears(musicTracks)]);
    if (set.size === 0) set.add(thisYear); // 何もないときは「記録はありません」を出すため
    return [...set].sort((a, b) => b - a);
  }, [logYears, musicTracks, thisYear]);

  // 初期値は今年（なければ新しい方の年）
  useEffect(() => {
    if (years.length === 0) return;
    setYear((cur) => (cur != null && years.includes(cur) ? cur : years.includes(thisYear) ? thisYear : years[0]));
  }, [years, thisYear]);

  // 年を変えたとき: その年のログだけ読む
  useEffect(() => {
    if (year == null) return;
    let alive = true;
    setRows(null);
    setPage(0);
    scrollRef.current?.scrollTo({ left: 0 });
    readPlayLogYear(year).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [year]);

  const review: YearReview | null = useMemo(
    () => (year != null && rows != null ? buildYearReview({ year, logRows: rows, tracks: musicTracks }) : null),
    [year, rows, musicTracks]
  );

  const art = (t: MusicTrack) => {
    const album = artworkSource === 'album' ? albumArtFor(t.id) : null;
    return album ? album.url : t.thumbnailUrl || `https://img.youtube.com/vi/${t.id}/mqdefault.jpg`;
  };

  const Cover: React.FC<{ t: MusicTrack; size?: string }> = ({ t, size = 'w-12 h-12' }) => (
    <img src={art(t)} alt="" referrerPolicy="no-referrer" loading="lazy" className={`${size} rounded-lg object-cover bg-surface shrink-0`} />
  );

  const cards: React.ReactNode[] = [];
  if (review) {
    const r = review;
    if (r.isEmpty) {
      cards.push(
        <div key="empty" className={`${CARD} items-center justify-center text-center`}>
          <p className="text-[34px] font-extrabold text-fg">{r.year}</p>
          <p className="text-[17px] text-muted mt-3">この年の記録はありません</p>
        </div>
      );
    } else {
      // (a) 表紙
      cards.push(
        <div key="cover" className={`${CARD} justify-center`}>
          <p className="text-[15px] text-muted">MeloTrace</p>
          <p className="text-[64px] leading-none font-extrabold text-accent mt-1">{r.year}</p>
          {r.hasLog ? (
            <>
              <p className="text-[40px] font-extrabold text-fg mt-8">{r.totalPlays.toLocaleString()}回</p>
              <p className="text-[15px] text-muted">再生</p>
              <p className="text-[28px] font-bold text-fg mt-5">{fmtDuration(r.totalSec)}</p>
              <p className="text-[15px] text-muted">総再生時間（推定）</p>
            </>
          ) : (
            <p className="text-[17px] text-muted mt-8">この年は再生ログがありません。取り込み時の記録から出せる項目だけを表示しています。</p>
          )}
        </div>
      );
      if (r.hasLog) {
        // (b) トップ曲
        cards.push(
          <div key="tracks" className={CARD}>
            <h2 className="text-[22px] font-bold text-fg mb-3">トップ曲</h2>
            {r.topTracks.length === 0 ? (
              <p className="text-[15px] text-muted">ライブラリにある曲の再生がないため、ランキングは出せません。</p>
            ) : (
              r.topTracks.map((x, i) => (
                <div key={x.track.id} className="flex items-center gap-3 py-2">
                  <span className="w-5 text-center text-[17px] font-bold text-accent">{i + 1}</span>
                  <Cover t={x.track} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-fg truncate">{x.track.title}</p>
                    <p className="text-[13px] text-muted truncate">{x.track.artist}</p>
                  </div>
                  <span className="text-[14px] text-muted shrink-0">{x.count}回</span>
                </div>
              ))
            )}
          </div>
        );
        // (c) トップアーティスト
        cards.push(
          <div key="artists" className={CARD}>
            <h2 className="text-[22px] font-bold text-fg mb-3">トップアーティスト</h2>
            {r.topArtists.length === 0 ? (
              <p className="text-[15px] text-muted">ライブラリにある曲の再生がないため、ランキングは出せません。</p>
            ) : (
              r.topArtists.map((x, i) => (
                <div key={x.artist} className="flex items-center gap-3 py-3">
                  <span className="w-5 text-center text-[17px] font-bold text-accent">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-[17px] font-semibold text-fg truncate">{x.artist}</p>
                  <span className="text-[14px] text-muted shrink-0">{x.count}回</span>
                </div>
              ))
            )}
          </div>
        );
        // (d) 一番聴いた月
        const max = Math.max(1, ...r.months);
        cards.push(
          <div key="months" className={CARD}>
            <h2 className="text-[22px] font-bold text-fg">一番聴いた月</h2>
            <p className="text-[15px] text-muted mt-1">
              {r.peakMonth != null ? `${r.peakMonth}月（${r.months[r.peakMonth - 1]}回）` : '再生の記録がありません'}
            </p>
            <div className="flex items-end gap-1.5 h-48 mt-8">
              {r.months.map((c, i) => (
                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center">
                  <div
                    className={`w-full rounded-t-md ${r.peakMonth === i + 1 ? 'bg-accent' : 'bg-fg/25'}`}
                    style={{ height: `${c > 0 ? Math.max(4, (c / max) * 100) : 0}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              {r.months.map((_, i) => (
                <span key={i} className="flex-1 text-center text-[11px] text-muted">
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
        );
      }
      // (e) その年に初めて聴いた曲
      if (r.firstHeardCount > 0) {
        cards.push(
          <div key="first" className={CARD}>
            <h2 className="text-[22px] font-bold text-fg">この年に初めて聴いた曲</h2>
            <p className="text-[15px] text-muted mt-1 mb-3">{r.firstHeardCount}曲。日付の早い3曲</p>
            {r.firstHeardEarliest.map((x) => (
              <div key={x.track.id} className="flex items-center gap-3 py-2">
                <Cover t={x.track} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-fg truncate">{x.track.title}</p>
                  <p className="text-[13px] text-muted truncate">{x.track.artist}</p>
                </div>
                <span className="text-[12px] text-muted shrink-0">{fmtDate(x.date)}</span>
              </div>
            ))}
          </div>
        );
      }
      // ログがない年: 最後に聴いたのがその年の曲
      if (!r.hasLog && r.lastHeardTop.length > 0) {
        cards.push(
          <div key="last" className={CARD}>
            <h2 className="text-[22px] font-bold text-fg">最後に聴いたのがこの年の曲</h2>
            <p className="text-[15px] text-muted mt-1 mb-3">再生回数の多い順</p>
            {r.lastHeardTop.map((x) => (
              <div key={x.track.id} className="flex items-center gap-3 py-2">
                <Cover t={x.track} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-fg truncate">{x.track.title}</p>
                  <p className="text-[13px] text-muted truncate">{x.track.artist}</p>
                </div>
                <span className="text-[13px] text-muted shrink-0">{x.track.playCount}回</span>
              </div>
            ))}
          </div>
        );
      }
      // (f) 根拠
      cards.push(
        <div key="basis" className={CARD}>
          <h2 className="text-[22px] font-bold text-fg mb-3">この集計の根拠</h2>
          <div className="space-y-3 text-[14px] text-muted leading-relaxed">
            {r.hasLog ? (
              <>
                <p>
                  再生ログ {r.totalPlays.toLocaleString()}件
                  {r.logStartDate ? `（${Number(r.logStartDate.slice(0, 4))}年${Number(r.logStartDate.slice(5, 7))}月から記録）` : ''}
                </p>
                <p>再生は30秒以上聴いたものを数えています（ラジオ・検索経由を含む）。総再生時間は、記録された秒数、なければ曲の長さ、それもなければ{DEFAULT_TRACK_SEC}秒で合計した推定です。</p>
                {r.unrankedPlays > 0 && <p>ライブラリにない曲の再生 {r.unrankedPlays}回は、合計には含め、ランキングには出していません。</p>}
                {r.firstHeardCount > 0 && <p>「初めて聴いた曲」は、曲に残る初回再生の記録から出しています。</p>}
              </>
            ) : (
              <p>再生ログがない年のため、取り込み時の記録（初回再生・最終再生）から出しています。回数・時間・月ごとの集計は出せません。</p>
            )}
          </div>
        </div>
      );
    }
  }

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="年間まとめ" onBack avatar={false} />

      <div className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`shrink-0 px-4 h-9 rounded-full text-[15px] font-semibold transition-colors ${
              y === year ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg'
            }`}
          >
            {y}年
          </button>
        ))}
      </div>

      {review == null ? (
        <p className="text-[15px] text-muted text-center py-24">読み込み中…</p>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="mt-3 flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
            style={{ scrollbarWidth: 'none' }}
          >
            {cards}
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {cards.map((_, i) => (
              <button
                key={i}
                aria-label={`${i + 1}枚目`}
                onClick={() => scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth || 0), behavior: 'smooth' })}
                className={`w-2 h-2 rounded-full transition-colors ${i === page ? 'bg-accent' : 'bg-fg/25'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
