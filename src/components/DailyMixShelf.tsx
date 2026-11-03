import React, { useEffect, useMemo, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import type { MusicTrack } from '../types/music';
import { readPlayLog, localDateString, type PlayLogRow } from '../utils/playLog';
import { buildDailyMixes, DAILY_MIX_META, DAILY_MIX_MIN } from '../utils/dailyMix';
import { loadDailyMixes, saveDailyMixes } from '../utils/dailyMixStore';

interface DailyMixShelfProps {
  tracks: MusicTrack[];
}

/** 「あなたのミックス」: 履歴から作った日替わりミックス。出せるものが無ければ棚ごと非表示。API 消費: ゼロ */
export const DailyMixShelf: React.FC<DailyMixShelfProps> = ({ tracks }) => {
  const { playTrack, isUnplayable } = usePlayer();
  const [today, setToday] = useState(() => localDateString(new Date()));
  const [logRows, setLogRows] = useState<PlayLogRow[] | null>(null);
  const [stored, setStored] = useState<Record<string, string[]>>({});

  // 日付をまたいで再表示されたとき、日付を更新する
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const d = localDateString(new Date());
      setToday((prev) => (prev === d ? prev : d));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ログはホームを開いたとき・日付が変わったときに1回だけ読む
  useEffect(() => {
    let alive = true;
    setLogRows(null);
    readPlayLog(3000).then((rows) => {
      if (alive) setLogRows(rows);
    });
    return () => {
      alive = false;
    };
  }, [today]);

  const playable = useMemo(() => tracks.filter((t) => !isUnplayable(t.id)), [tracks, isUnplayable]);

  // 保存分を優先し、足りないミックスだけ新しく作って保存する
  useEffect(() => {
    if (logRows === null) return;
    const saved = loadDailyMixes(today);
    const missing = Object.keys(DAILY_MIX_META).some((id) => !saved.mixes[id]);
    if (missing && playable.length > 0) {
      for (const m of buildDailyMixes({ tracks: playable, logRows, today })) {
        if (!saved.mixes[m.id]) saved.mixes[m.id] = m.trackIds;
      }
      saveDailyMixes(saved);
    }
    setStored(saved.mixes);
  }, [logRows, today, playable]);

  const mixes = useMemo(() => {
    const byId = new Map(playable.map((t) => [t.id, t]));
    return Object.keys(DAILY_MIX_META)
      .map((id) => {
        const list = (stored[id] ?? []).map((tid) => byId.get(tid)).filter((t): t is MusicTrack => !!t);
        return { id, ...DAILY_MIX_META[id], list };
      })
      .filter((m) => m.list.length >= DAILY_MIX_MIN);
  }, [stored, playable]);

  if (mixes.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-fg tracking-tight">あなたのミックス</h3>
        <p className="text-xs text-muted">聴いた履歴から、毎日つくります</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {mixes.map((m) => (
          <button
            key={m.id}
            onClick={() => playTrack(m.list[0], m.list)}
            className="w-44 shrink-0 text-left cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-44 h-44 rounded-xl overflow-hidden mb-2 bg-surface border border-fg/10 shadow-md grid grid-cols-2 grid-rows-2">
              {m.list.slice(0, 4).map((t) => (
                <img key={t.id} src={t.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
              ))}
            </div>
            <h4 className="text-xs font-semibold text-fg truncate leading-tight">{m.title}</h4>
            <p className="text-[11px] text-muted truncate mt-0.5">{m.subtitle}</p>
          </button>
        ))}
      </div>
    </section>
  );
};
