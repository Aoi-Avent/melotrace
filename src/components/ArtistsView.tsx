import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Heart, BadgeCheck, Star, ChevronRight } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { usePlayer } from '../context/PlayerContext';
import { ArtistSummary, MusicTrack } from '../types/music';
import { BackgroundPlayButton } from './BackgroundGuide';
import { ArtistFilterToggle } from './ArtistFilterToggle';

type ArtistSortKey = 'name' | 'plays' | 'first' | 'last' | 'favorites' | 'tracks';
type Dir = 'asc' | 'desc';

const SORTS: { key: ArtistSortKey; label: string; defaultDir: Dir }[] = [
  { key: 'name', label: '五十音順', defaultDir: 'asc' },
  { key: 'plays', label: 'よく聴く順', defaultDir: 'desc' },
  { key: 'last', label: '最近聴いた順', defaultDir: 'desc' },
  { key: 'first', label: '初めて聴いた順', defaultDir: 'asc' },
  { key: 'favorites', label: 'スキの数順', defaultDir: 'desc' },
  { key: 'tracks', label: '曲数順', defaultDir: 'desc' },
];

const collator = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });
const STORAGE_KEY = 'melotrace_artists_sort_v1';

export const ArtistsView: React.FC<{ favoritesOnly?: boolean }> = ({ favoritesOnly = false }) => {
  const { musicTracks, setSelectedArtistForDetail, playTrack, artistStatus, setArtistOverride, favoriteArtists, toggleFavoriteArtist } = usePlayer();
  const [query, setQuery] = useState('');
  const favOnly = favoritesOnly;
  const favSet = useMemo(() => new Set(favoriteArtists), [favoriteArtists]);
  const [sortKey, setSortKey] = useState<ArtistSortKey>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (v && SORTS.some((s) => s.key === v.key)) return v.key;
    } catch (e) {}
    return 'plays';
  });
  const [dir, setDir] = useState<Dir>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (v && (v.dir === 'asc' || v.dir === 'desc')) return v.dir;
    } catch (e) {}
    return 'desc';
  });

  const update = (key: ArtistSortKey, d: Dir) => {
    setSortKey(key);
    setDir(d);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, dir: d }));
    } catch (e) {}
  };

  const artists: ArtistSummary[] = useMemo(() => {
    const map = new Map<string, ArtistSummary>();
    for (const t of musicTracks) {
      if (!t) continue;
      const name = typeof t.artist === 'string' && t.artist ? t.artist : t.artist ? String(t.artist) : '(不明)';
      let a = map.get(name);
      if (!a) {
        a = { name, trackCount: 0, totalPlayCount: 0, favoriteCount: 0, tracks: [], thumbnailUrl: undefined };
        map.set(name, a);
      }
      a.trackCount += 1;
      a.totalPlayCount += t.playCount || 0;
      if (t.isFavorite) a.favoriteCount += 1;
      const fp = t.firstPlayed ? String(t.firstPlayed) : '';
      const lp = t.lastPlayed ? String(t.lastPlayed) : '';
      if (fp && (!a.firstPlayed || fp < a.firstPlayed)) a.firstPlayed = fp;
      if (lp && (!a.lastPlayed || lp > a.lastPlayed)) a.lastPlayed = lp;
      a.tracks.push(t);
    }
    // 代表サムネイル: 再生回数が最も多い曲
    map.forEach((a) => {
      let top: MusicTrack | undefined;
      for (const x of a.tracks) if (!top || (x.playCount || 0) > (top.playCount || 0)) top = x;
      a.thumbnailUrl = top && top.id ? `https://img.youtube.com/vi/${top.id}/mqdefault.jpg` : undefined;
    });
    return Array.from(map.values());
  }, [musicTracks]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = favOnly ? artists.filter((a) => favSet.has(a.name)) : artists;
    const filtered = q ? base.filter((a) => String(a.name).toLowerCase().includes(q)) : base;
    const sign = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'name':
          c = collator.compare(a.name, b.name);
          break;
        case 'plays':
          c = a.totalPlayCount - b.totalPlayCount;
          break;
        case 'tracks':
          c = a.trackCount - b.trackCount;
          break;
        case 'favorites':
          c = a.favoriteCount - b.favoriteCount;
          break;
        case 'first':
          c = (a.firstPlayed || '9999').localeCompare(b.firstPlayed || '9999');
          break;
        case 'last':
          c = (a.lastPlayed || '').localeCompare(b.lastPlayed || '');
          break;
      }
      // 同値は名前順で安定化（二次キー）
      return c !== 0 ? c * sign : collator.compare(a.name, b.name);
    });
  }, [artists, query, sortKey, dir, favOnly, favSet]);
  // 段階表示: 最初に60件、リスト末尾に来たら60件ずつ追加（全行一括描画を避ける）
  const PAGE = 60;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [query, sortKey, dir, favOnly]);
  const shown = useMemo(() => list.slice(0, limit), [list, limit]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || limit >= list.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE);
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, list.length]);

  const favCount = useMemo(() => artists.filter((a) => favSet.has(a.name)).length, [artists, favSet]);

  const subtitle = (a: ArtistSummary) => {
    switch (sortKey) {
      case 'favorites':
        return `スキ ${a.favoriteCount}曲 ・ ${a.trackCount}曲`;
      case 'first':
        return `初回 ${a.firstPlayed?.slice(0, 10) ?? '不明'} ・ ${a.trackCount}曲`;
      case 'last':
        return `最終 ${a.lastPlayed?.slice(0, 10) ?? '不明'} ・ ${a.trackCount}曲`;
      default:
        return `${a.trackCount}曲 ・ 再生 ${a.totalPlayCount}回`;
    }
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title={favOnly ? 'お気に入りのアーティスト' : 'アーティスト'} onBack subtitle={`${list.length} 組`} />

      <div className="relative mb-3">
        <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="アーティスト・チャンネルを検索"
          className="w-full pl-10 pr-3 py-2.5 rounded-full mt-soft text-[15px] text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => update(s.key, sortKey === s.key ? (dir === 'asc' ? 'desc' : 'asc') : s.defaultDir)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold flex items-center gap-1 transition-colors ${
              sortKey === s.key ? 'bg-fg text-inverse' : 'mt-soft text-fg/85'
            }`}
          >
            {s.label}
            {sortKey === s.key && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-col mt-stagger">
        {shown.map((a) => {
          const verified = artistStatus(a.name) === 'verified';
          return (
            <div
              key={a.name}
              onClick={() => setSelectedArtistForDetail(a.name)}
              className="relative flex items-center gap-3 py-2.5 cursor-pointer active:opacity-60 transition-opacity"
            >
              <div className="w-[54px] h-[54px] rounded-full overflow-hidden bg-surface-2 shrink-0">
                {a.thumbnailUrl && (
                  <img src={a.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover mt-focus" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[17px] font-medium text-fg truncate flex items-center gap-1.5">
                  <span className="truncate">{a.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(verified ? `「${a.name}」を公式アーティストから外しますか？` : `「${a.name}」を公式アーティストとして扱いますか？`)) {
                        setArtistOverride(a.name, verified ? 'exclude' : 'official');
                      }
                    }}
                    className="shrink-0"
                    aria-label="公式かどうかを手動で変更"
                  >
                    <BadgeCheck className={`w-4 h-4 ${verified ? 'text-accent' : 'text-fg/20'}`} />
                  </button>
                </h4>
                <p className="text-[13px] text-muted truncate flex items-center gap-1">
                  {sortKey === 'favorites' && <Heart className="w-3 h-3 text-accent fill-accent" />}
                  {subtitle(a)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteArtist(a.name);
                }}
                className={`w-9 h-9 flex items-center justify-center shrink-0 transition-colors ${favSet.has(a.name) ? 'text-accent' : 'text-fg/40'}`}
                aria-label={favSet.has(a.name) ? 'お気に入りを解除' : 'お気に入りに追加'}
              >
                <Star className={`w-[20px] h-[20px] ${favSet.has(a.name) ? 'fill-current' : ''}`} />
              </button>
              <ChevronRight className="w-4 h-4 text-muted shrink-0 -ml-1" />
              <span className="absolute left-[66px] right-0 bottom-0 h-px bg-fg/10" />
            </div>
          );
        })}
        {limit < list.length && <div ref={sentinelRef} className="h-8" aria-hidden />}
        {list.length === 0 && (
          <p className="text-[14px] text-muted text-center py-16 px-6 leading-relaxed">
            {favOnly && !query
              ? 'お気に入りのアーティストはまだいません。アーティスト一覧の ☆ を押すと追加できます。'
              : '該当するアーティストがいません。'}
          </p>
        )}
      </div>
    </div>
  );
};
