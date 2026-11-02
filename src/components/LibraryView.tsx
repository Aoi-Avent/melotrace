import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Heart,
  Play,
  Plus,
  ExternalLink,
  ListMusic,
  SlidersHorizontal,
  FolderPlus,
  X,
  Check,
  Ban,
  MoreVertical,
  Trash2,
  ChevronLeft,
  Shuffle,
  Pencil,
  MoreHorizontal,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PageHeader, GlassPill } from './PageHeader';
import { MusicTrack } from '../types/music';
import { libraryMem } from '../utils/viewMemory';
import {
  SortRule,
  TrackSortKey,
  SORT_KEY_LABELS,
  DEFAULT_DIR,
  DEFAULT_SORT_RULES,
  MAX_SORT_RULES,
  sortTracksMulti,
  groupByArtist,
} from '../utils/sorting';
import { BackgroundPlayButton } from './BackgroundGuide';
import { ArtistFilterToggle } from './ArtistFilterToggle';

// 並び順が変わったときの「最新の順に更新」ボタンの表示。仕組み（画面を見ている間は並びを固定する）はそのままで、表示だけ隠している。
// 元に戻すときは true にする。
const SHOW_ORDER_BANNER = false;
const SORT_STORAGE_KEY = 'melotrace_library_sort_v2';
const GROUP_STORAGE_KEY = 'melotrace_library_group_artist_v1';

type LibSection = 'all' | 'vocaloid' | 'bgm' | 'favorites' | 'playlists';
const SECTION_TITLES: Record<LibSection, string> = {
  all: '曲',
  vocaloid: 'ボカロ・歌ってみた',
  bgm: 'BGM',
  favorites: 'お気に入りの曲',
  playlists: 'プレイリスト',
};

export const LibraryView: React.FC<{ section?: LibSection }> = ({ section }) => {
  const {
    activeTracks,
    musicTracks,
    bgmTracks,
    playlists,
    currentTrack,
    isPlaying,
    playTrack,
    toggleFavorite,
    addSingleTrackByUrl,
    createPlaylist,
    setSelectedArtistForDetail,
    banArtist,
    banTrack,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    setIsShuffle,
  } = usePlayer();

  const [searchQuery, setSearchQuery] = useState(libraryMem.search);
  const [selectedGenre, setSelectedGenre] = useState<string>(libraryMem.genre);
  const [sortRules, setSortRules] = useState<SortRule[]>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_SORT_RULES;
  });
  const [groupArtist, setGroupArtist] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GROUP_STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });
  const [showSortPanel, setShowSortPanel] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortRules));
      localStorage.setItem(GROUP_STORAGE_KEY, String(groupArtist));
    } catch (e) {}
  }, [sortRules, groupArtist]);
  const [activeSubTab, setActiveSubTab] = useState<LibSection>(section ?? libraryMem.sub);
  const [showAddUrlModal, setShowAddUrlModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [inputArtist, setInputArtist] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(libraryMem.visible);
  const mountedRef = useRef(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Active track options modal
  const [targetTrackForMenu, setTargetTrackForMenu] = useState<MusicTrack | null>(null);

  // New playlist modal state
  const [showNewPlModal, setShowNewPlModal] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [pendingAddTrackId, setPendingAddTrackId] = useState<string | null>(null);

  // Reset pagination when filter/search/tab changes
  // 検索・並び替えなどの条件を変えたときだけ、表示件数を戻す（画面を離れて戻っただけでは戻さない）
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setVisibleCount(60);
  }, [searchQuery, selectedGenre, sortRules, groupArtist, activeSubTab]);

  useEffect(() => {
    libraryMem.search = searchQuery;
    libraryMem.genre = selectedGenre;
    libraryMem.sub = activeSubTab;
  }, [searchQuery, selectedGenre, activeSubTab]);
  useEffect(() => {
    libraryMem.visible = visibleCount;
  }, [visibleCount]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    activeTracks.forEach((t) => {
      if (t.genre) set.add(t.genre);
    });
    return Array.from(set);
  }, [activeTracks]);

  // Filtered & sorted tracks (high-performance fast comparison)
  const filteredTracks = useMemo(() => {
    const baseList = activeSubTab === 'bgm' ? bgmTracks : activeSubTab === 'all' ? musicTracks : activeTracks;
    const q = searchQuery.trim().toLowerCase();

    const filtered = baseList.filter((t) => {
      if (activeSubTab === 'favorites') return t.isFavorite;
      if (activeSubTab === 'vocaloid') {
        return t.genre === 'ボカロ・VOCALOID' || t.genre === '歌ってみた・Cover';
      }
      if (activeSubTab === 'bgm') return true;
      if (selectedGenre !== 'all' && t.genre !== selectedGenre) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.genre && t.genre.toLowerCase().includes(q))
      );
    });

    const sorted = sortTracksMulti(filtered, sortRules);
    if (!groupArtist) return sorted;
    // アーティスト毎: アーティスト単位でまとめ、グループ順＝各グループ先頭曲の並び順、グループ内＝同じソート規則
    return groupByArtist(sorted).flatMap((g) => g.tracks);
  }, [activeTracks, musicTracks, bgmTracks, searchQuery, selectedGenre, sortRules, groupArtist, activeSubTab]);

  // ---- 並び順の固定 ----
  // 曲を再生すると「最近聴いた順」などで並びが変わり、タップした曲が一覧から消えたように見えてしまう。
  // そのため、画面を見ている間は並びを固定し、変わった場合は「最新の順に更新」ボタンで反映できるようにする。
  const [orderVersion, setOrderVersion] = useState(0);
  const orderSig = JSON.stringify([searchQuery, selectedGenre, sortRules, groupArtist, activeSubTab]);
  const freshIds = useMemo(() => filteredTracks.map((t) => t.id), [filteredTracks]);
  if (libraryMem.snap.sig !== orderSig) libraryMem.snap = { sig: orderSig, ids: freshIds };
  const displayTracks = useMemo(() => {
    const byId = new Map(filteredTracks.map((t) => [t.id, t]));
    const snap = libraryMem.snap.ids;
    const known = new Set(snap);
    const added = freshIds.filter((id) => !known.has(id)); // 新しく一覧に入った曲は先頭に
    const kept = snap.filter((id) => byId.has(id));
    return [...added, ...kept].map((id) => byId.get(id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTracks, freshIds, orderVersion]);
  const orderStale = useMemo(() => {
    if (displayTracks.length !== freshIds.length) return false;
    for (let i = 0; i < freshIds.length; i++) if (displayTracks[i].id !== freshIds[i]) return true;
    return false;
  }, [displayTracks, freshIds]);
  const applyFreshOrder = () => {
    libraryMem.snap = { sig: orderSig, ids: freshIds };
    setOrderVersion((v) => v + 1);
    document.querySelector<HTMLElement>('main .ios-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // Infinite scroll observer to smoothly load more items without freezing DOM
  useEffect(() => {
    if (!observerRef.current || visibleCount >= displayTracks.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 60, displayTracks.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [visibleCount, displayTracks.length]);

  const handleAddTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    const ok = addSingleTrackByUrl(inputUrl.trim(), inputTitle.trim(), inputArtist.trim());
    if (ok) {
      setAddSuccess(true);
      setTimeout(() => {
        setAddSuccess(false);
        setShowAddUrlModal(false);
        setInputUrl('');
        setInputTitle('');
        setInputArtist('');
      }, 1000);
    } else {
      alert('有効なYouTubeのURLまたは動画IDを入力してください。');
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    createPlaylist(newPlName.trim(), undefined, undefined, pendingAddTrackId ? [pendingAddTrackId] : []);
    setPendingAddTrackId(null);
    setNewPlName('');
    setShowNewPlModal(false);
  };

  return (
    <div className="ios-scroll-container pb-36 pt-2 px-4 max-w-lg mx-auto">
      {/* ミュージック風の見出し: 戻る / 大きなタイトル / 再生・シャッフル */}
      <PageHeader
        title={SECTION_TITLES[activeSubTab]}
        onBack
        actions={
          activeSubTab === 'playlists' ? (
            <GlassPill>
              <button onClick={() => setShowNewPlModal(true)} className="w-11 h-8 flex items-center justify-center" aria-label="プレイリストを作成">
                <Plus className="w-5 h-5" />
              </button>
            </GlassPill>
          ) : (
            <GlassPill>
              <button
                onClick={() => setShowSortPanel((v) => !v)}
                className={`w-10 h-8 flex items-center justify-center ${showSortPanel ? 'text-accent' : ''}`}
                aria-label="並び替え"
              >
                <SlidersHorizontal className="w-[18px] h-[18px]" />
              </button>
              <button onClick={() => setShowAddUrlModal(true)} className="w-10 h-8 flex items-center justify-center" aria-label="曲を追加">
                <Plus className="w-5 h-5" />
              </button>
            </GlassPill>
          )
        }
      />
      {activeSubTab !== 'playlists' && (
        <div className="flex gap-3 mb-4 mt-1">
          <button
            onClick={() => displayTracks.length > 0 && playTrack(displayTracks[0], displayTracks)}
            className="flex-1 h-11 rounded-full mt-soft text-accent text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Play className="w-4 h-4 fill-current" />
            再生
          </button>
          <button
            onClick={() => {
              if (displayTracks.length === 0) return;
              setIsShuffle(true);
              playTrack(displayTracks[Math.floor(Math.random() * displayTracks.length)], displayTracks);
            }}
            className="flex-1 h-11 rounded-full mt-soft text-accent text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Shuffle className="w-4 h-4" />
            シャッフル
          </button>
        </div>
      )}

      {/* TRACKS LIST VIEW */}
      {activeSubTab !== 'playlists' && (
        <>
          {/* iOS Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="曲名、アーティスト、ボカロP名で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-full mt-soft text-[15px] text-fg placeholder-[#8e8e93] focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Genre filter pills */}
          {activeSubTab === 'all' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none -mx-4 px-4">
              <button
                onClick={() => setSelectedGenre('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors ${
                  selectedGenre === 'all'
                    ? 'bg-fg text-inverse font-semibold'
                    : 'apple-card text-muted hover:text-fg'
                }`}
              >
                すべて
              </button>
              {genres.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGenre(g)}
                  className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors ${
                    selectedGenre === g
                      ? 'bg-fg text-inverse font-semibold'
                      : 'apple-card text-muted hover:text-fg'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {/* Sort bar */}
          <div className="flex items-center justify-between text-xs text-muted mb-2 px-1">
            <span>{displayTracks.length} 曲</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGroupArtist((v) => !v)}
                className={`px-2 py-1 rounded-full font-semibold transition-colors ${
                  groupArtist ? 'bg-accent text-on-accent' : 'bg-fg/10 text-fg/80'
                }`}
              >
                アーティスト毎
              </button>
            </div>
          </div>

          {showSortPanel && (
            <div className="mb-3 p-3 rounded-2xl bg-white/[0.06] border border-fg/10 flex flex-col gap-2">
              <p className="text-[10px] text-muted">上の段ほど優先。同じ値のときだけ次の段で並べ替えます。</p>
              {sortRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center text-muted font-bold">{i + 1}</span>
                  <select
                    value={rule.key}
                    onChange={(e) => {
                      const key = e.target.value as TrackSortKey;
                      setSortRules((prev) => prev.map((r, j) => (j === i ? { key, dir: DEFAULT_DIR[key] } : r)));
                    }}
                    className="flex-1 bg-surface text-fg rounded-lg px-2 py-1.5 focus:outline-none"
                  >
                    {(Object.keys(SORT_KEY_LABELS) as TrackSortKey[]).map((k) => (
                      <option key={k} value={k}>{SORT_KEY_LABELS[k]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      setSortRules((prev) => prev.map((r, j) => (j === i ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r)))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-fg/10 text-fg font-semibold w-14"
                  >
                    {rule.dir === 'asc' ? '昇順' : '降順'}
                  </button>
                  <button
                    onClick={() => setSortRules((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                    disabled={sortRules.length <= 1}
                    className="p-1.5 rounded-lg text-muted disabled:opacity-30"
                    aria-label="この段を削除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sortRules.length < MAX_SORT_RULES && (
                <button
                  onClick={() => {
                    const used = new Set(sortRules.map((r) => r.key));
                    const next = (Object.keys(SORT_KEY_LABELS) as TrackSortKey[]).find((k) => !used.has(k)) || 'title';
                    setSortRules((prev) => [...prev, { key: next, dir: DEFAULT_DIR[next] }]);
                  }}
                  className="self-start px-3 py-1.5 rounded-lg bg-fg/10 text-fg text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />条件を追加
                </button>
              )}
            </div>
          )}

          {SHOW_ORDER_BANNER && orderStale && (
            <div className="sticky top-1 z-10 flex justify-center mb-2">
              <button
                onClick={applyFreshOrder}
                className="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[11px] font-bold shadow-lg active:scale-95 transition flex items-center gap-1.5"
              >
                並び順が変わりました ・ 最新の順に更新 ↑
              </button>
            </div>
          )}

          {/* iOS Track Rows (Windowed / Infinite Scroll) */}
          <div className="flex flex-col">
            {displayTracks.slice(0, visibleCount).map((track, idx, arr) => {
              const isCurrent = currentTrack?.id === track.id;
              const showGroupHeader = groupArtist && (idx === 0 || arr[idx - 1].artist !== track.artist);
              return (
                <React.Fragment key={track.id}>
                {showGroupHeader && (
                  <button
                    onClick={() => setSelectedArtistForDetail(track.artist)}
                    className="mt-3 first:mt-0 px-1 text-left text-[13px] font-bold text-fg flex items-center gap-2"
                  >
                    <span className="truncate">{track.artist}</span>
                    <span className="text-[10px] font-medium text-muted shrink-0">
                      {displayTracks.filter((t) => t.artist === track.artist).length}曲
                    </span>
                  </button>
                )}
                <div
                  onClick={() => playTrack(track, displayTracks)}
                  style={idx < 12 ? ({ ['--i' as any]: idx } as React.CSSProperties) : undefined}
                  className={`${idx < 12 ? 'mt-row-in ' : ''}relative flex items-center gap-3 py-2 cursor-pointer active:opacity-60 transition-opacity group`}
                >
                  <div className="relative w-[50px] h-[50px] rounded-[7px] overflow-hidden shrink-0 bg-surface-2">
                    <img
                      src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                      alt={track.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover mt-focus"
                      loading="lazy"
                    />
                    {isCurrent && isPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-end gap-[2px] h-3">
                          <span className="w-1 bg-accent rounded-full apple-eq-bar-1" />
                          <span className="w-1 bg-accent rounded-full apple-eq-bar-2" />
                          <span className="w-1 bg-accent rounded-full apple-eq-bar-3" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-1">
                    <h4
                      className={`text-[16px] font-medium truncate leading-snug ${
                        isCurrent ? 'text-accent' : 'text-fg'
                      }`}
                    >
                      {track.title}
                    </h4>
                    <p
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArtistForDetail(track.artist);
                      }}
                      className="text-[14px] text-muted truncate mt-0.5 cursor-pointer"
                      title="アーティスト詳細を開く"
                    >
                      {track.artist}
                    </p>
                  </div>

                  <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    {track.isFavorite && <Heart className="w-4 h-4 text-accent fill-accent mr-1" />}
                    <button
                      onClick={() => setTargetTrackForMenu(track)}
                      className="w-10 h-10 flex items-center justify-center text-fg active:opacity-50 transition-opacity"
                      title="メニュー"
                    >
                      <MoreHorizontal className="w-[22px] h-[22px]" />
                    </button>
                  </div>
                  <span className="absolute left-[62px] right-0 bottom-0 h-px bg-fg/10" />
                </div>
                </React.Fragment>
              );
            })}

            {/* Infinite Scroll Trigger Sentinel */}
            {visibleCount < displayTracks.length && (
              <div ref={observerRef} className="py-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => Math.min(prev + 60, displayTracks.length))}
                  className="px-5 py-2.5 rounded-full bg-fg/10 hover:bg-fg/15 active:scale-95 text-fg text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-lg"
                >
                  <span>さらに表示（残り {displayTracks.length - visibleCount} 曲）</span>
                </button>
              </div>
            )}

            {displayTracks.length === 0 && (
              <div className="text-center py-12 text-muted text-xs">
                条件に一致する曲が見つかりませんでした
              </div>
            )}
          </div>
        </>
      )}

      {/* Track Action Bottom Sheet */}
      {targetTrackForMenu && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-end justify-center p-3 animate-in fade-in duration-200" onClick={() => setTargetTrackForMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[28px] lg-glass p-4 flex flex-col gap-2 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-fg/10">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold text-fg truncate">{targetTrackForMenu.title}</p>
                <p className="text-[11px] text-muted truncate">{targetTrackForMenu.artist}</p>
              </div>
              <button onClick={() => setTargetTrackForMenu(null)} className="text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                toggleFavorite(targetTrackForMenu.id);
                setTargetTrackForMenu(null);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-fg/5 hover:bg-fg/10 text-left text-xs font-semibold text-fg flex items-center gap-2"
            >
              <Heart className={`w-4 h-4 text-accent ${targetTrackForMenu.isFavorite ? 'fill-accent' : ''}`} />
              <span>{targetTrackForMenu.isFavorite ? 'お気に入りから外す' : 'お気に入りに追加'}</span>
            </button>

            <button
              onClick={() => {
                banTrack(targetTrackForMenu.id);
                setTargetTrackForMenu(null);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-fg/5 hover:bg-fg/10 text-left text-xs font-semibold text-accent flex items-center gap-2"
            >
              <Ban className="w-4 h-4" />
              <span>この曲を非表示 (Ban) にする</span>
            </button>

            <button
              onClick={() => {
                banArtist(targetTrackForMenu.artist);
                setTargetTrackForMenu(null);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-fg/5 hover:bg-fg/10 text-left text-xs font-semibold text-accent flex items-center gap-2"
            >
              <Ban className="w-4 h-4" />
              <span>「{targetTrackForMenu.artist}」の全動画をBan</span>
            </button>

            <div className="rounded-xl bg-fg/5 p-2.5">
              <p className="text-[11px] font-semibold text-muted mb-1.5">プレイリストに追加</p>
              <div className="flex flex-wrap gap-1.5">
                {playlists.map((pl) => {
                  const already = pl.trackIds.includes(targetTrackForMenu.id);
                  return (
                    <button
                      key={pl.id}
                      disabled={already}
                      onClick={() => {
                        addTrackToPlaylist(pl.id, targetTrackForMenu.id);
                        setTargetTrackForMenu(null);
                      }}
                      className="px-2.5 py-1.5 rounded-full bg-fg/10 text-[11px] font-semibold text-fg disabled:opacity-40"
                    >
                      {already ? '✓ ' : ''}{pl.name}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setPendingAddTrackId(targetTrackForMenu.id);
                    setTargetTrackForMenu(null);
                    setShowNewPlModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-full bg-accent/20 text-[11px] font-semibold text-accent"
                >
                  ＋ 新規作成
                </button>
              </div>
            </div>

            <a
              href={`https://www.youtube.com/watch?v=${targetTrackForMenu.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl bg-fg/5 hover:bg-fg/10 text-left text-xs font-semibold text-fg flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4 text-muted" />
              <span>YouTubeで確認する</span>
            </a>
          </div>
        </div>
      )}

      {/* PLAYLISTS VIEW */}
      {activeSubTab === 'playlists' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
              作成したプレイリスト
            </h3>
            <button
              onClick={() => setShowNewPlModal(true)}
              className="flex items-center gap-1 text-xs text-accent font-semibold hover:underline"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>新規作成</span>
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {playlists.map((pl) => {
              const plTracks = activeTracks.filter((t) => pl.trackIds.includes(t.id));
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="flex items-center gap-3 p-3 rounded-xl apple-card hover:bg-fg/[0.08] cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-surface-3 to-accent/40 border border-fg/10 flex items-center justify-center shrink-0">
                    <ListMusic className="w-6 h-6 text-fg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-fg truncate">{pl.name}</h4>
                    <p className="text-xs text-muted mt-0.5">{plTracks.length} 曲</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (plTracks.length > 0) playTrack(plTracks[0], plTracks);
                    }}
                    className="w-8 h-8 rounded-full bg-fg/10 text-fg flex items-center justify-center shrink-0"
                    aria-label="再生"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </button>
                </div>
              );
            })}
            {playlists.length === 0 && (
              <p className="text-xs text-muted text-center py-10">
                プレイリストはまだありません。「新規作成」か、曲のメニューから追加できます。
              </p>
            )}
          </div>
        </div>
      )}

      {/* PLAYLIST DETAIL */}
      {selectedPlaylistId && (() => {
        const pl = playlists.find((p) => p.id === selectedPlaylistId);
        if (!pl) return null;
        const byId = new Map(activeTracks.map((t) => [t.id, t]));
        const plTracks = pl.trackIds.map((id) => byId.get(id)).filter((t): t is MusicTrack => Boolean(t));
        return (
          <div className="fixed inset-0 z-[55] bg-app flex flex-col">
            <div className="max-w-lg w-full mx-auto flex flex-col h-full">
              <header className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top,0px),12px)] pb-2">
                <button onClick={() => setSelectedPlaylistId(null)} className="p-2 text-accent flex items-center text-sm font-semibold">
                  <ChevronLeft className="w-5 h-5" />戻る
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const name = window.prompt('プレイリスト名', pl.name);
                      if (name && name.trim()) updatePlaylist(pl.id, { name: name.trim() });
                    }}
                    className="p-2 text-muted"
                    aria-label="名前を変更"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`「${pl.name}」を削除しますか？（曲自体は消えません）`)) {
                        deletePlaylist(pl.id);
                        setSelectedPlaylistId(null);
                      }
                    }}
                    className="p-2 text-accent"
                    aria-label="プレイリストを削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </header>
              <div className="px-5 pb-3">
                <h2 className="text-xl font-bold text-fg">{pl.name}</h2>
                <p className="text-xs text-muted mt-0.5">{plTracks.length} 曲</p>
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={plTracks.length === 0}
                    onClick={() => { setIsShuffle(false); playTrack(plTracks[0], plTracks); }}
                    className="flex-1 py-2.5 rounded-xl bg-accent text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />再生
                  </button>
                  <button
                    disabled={plTracks.length === 0}
                    onClick={() => {
                      setIsShuffle(true);
                      const t = plTracks[Math.floor(Math.random() * plTracks.length)];
                      playTrack(t, plTracks);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-fg/10 text-fg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Shuffle className="w-3.5 h-3.5" />シャッフル
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto ios-scroll-container px-4 pb-36 flex flex-col gap-1.5">
                {plTracks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => playTrack(t, plTracks)}
                    className="flex items-center gap-3 p-2.5 rounded-xl apple-card cursor-pointer"
                  >
                    <img
                      src={`https://img.youtube.com/vi/${t.id}/mqdefault.jpg`}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-11 h-11 rounded-lg object-cover mt-thumb bg-surface-2"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${currentTrack?.id === t.id ? 'text-accent' : 'text-fg'}`}>{t.title}</p>
                      <p className="text-[11px] text-muted truncate">{t.artist}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTrackFromPlaylist(pl.id, t.id); }}
                      className="p-2 text-muted hover:text-accent"
                      aria-label="プレイリストから外す"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {plTracks.length === 0 && (
                  <p className="text-xs text-muted text-center py-10">
                    曲がありません。ライブラリの曲の「⋮」メニューから追加できます。
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Track by URL Modal */}
      {showAddUrlModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl apple-card p-5 shadow-2xl border border-fg/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-fg">YouTubeの曲を追加</h3>
              <button
                onClick={() => setShowAddUrlModal(false)}
                className="p-1 text-muted hover:text-fg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              YouTubeのURLまたは11桁の動画IDを入力すると、ボカロ曲やカバー曲も自動で判別してライブラリに追加されます。
            </p>

            <form onSubmit={handleAddTrack} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  YouTubeのURL / ID <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  placeholder="https://youtu.be/... または watch?v=..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  曲名 (任意)
                </label>
                <input
                  type="text"
                  placeholder="例: 雨とペトラ, About me"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  アーティスト / ボカロP (任意)
                </label>
                <input
                  type="text"
                  placeholder="例: バルーン, 蝶々P"
                  value={inputArtist}
                  onChange={(e) => setInputArtist(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUrlModal(false)}
                  className="flex-1 py-2 rounded-xl bg-fg/10 text-fg text-xs font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-accent text-on-accent text-xs font-bold flex items-center justify-center gap-1"
                >
                  {addSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>追加完了！</span>
                    </>
                  ) : (
                    <span>追加する</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Playlist Modal */}
      {showNewPlModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl apple-card p-5 shadow-2xl border border-fg/10">
            <h3 className="text-base font-bold text-fg mb-2">新規プレイリスト作成</h3>
            <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="プレイリスト名"
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPlModal(false)}
                  className="flex-1 py-2 rounded-xl bg-fg/10 text-fg text-xs font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-accent text-on-accent text-xs font-bold"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
