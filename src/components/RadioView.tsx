import { PageHeader } from './PageHeader';
import React, { useState } from 'react';
import { Radio, Play, Sparkles, Flame, Moon, Zap, Coffee, Car, Heart, Music2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { QUICK_MIXES } from '../data/quickMixes';
import { QuickMixItem } from '../types/music';
import { BackgroundPlayButton } from './BackgroundGuide';

export const RadioView: React.FC = () => {
  const { activeTracks: tracks, playTrack, setIsShuffle, loadDemoData } = usePlayer();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'すべて' },
    { id: 'mood', label: '気分・ムード' },
    { id: 'activity', label: '作業・ドライブ' },
    { id: 'genre', label: 'ジャンル別' },
    { id: 'history', label: '履歴から発掘' },
  ];

  const filteredMixes = QUICK_MIXES.filter((m) => {
    if (selectedCategory === 'all') return true;
    return m.category === selectedCategory;
  });

  const handlePlayMix = (mix: QuickMixItem) => {
    if (tracks.length === 0) {
      loadDemoData();
      return;
    }
    const filtered = mix.filterFn(tracks);
    const targetTracks = filtered.length > 0 ? filtered : tracks;
    setIsShuffle(true);
    const randomIdx = Math.floor(Math.random() * targetTracks.length);
    playTrack(targetTracks[randomIdx], targetTracks);
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="ラジオ" subtitle="全24種類のスマートステーションから今の気分を選ぶ" />

      {/* Category Pills (Apple Music segmented filter) */}
      <div className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none mb-4 -mx-4 px-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              selectedCategory === cat.id
                ? 'bg-fg text-inverse shadow-sm'
                : 'apple-card text-muted hover:text-fg'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid of All Mix Stations */}
      <div className="grid grid-cols-2 gap-3">
        {filteredMixes.map((mix) => (
          <div
            key={mix.id}
            onClick={() => handlePlayMix(mix)}
            className="apple-card p-4 rounded-2xl cursor-pointer hover:bg-white/[0.08] active:scale-[0.98] transition-all flex flex-col justify-between min-h-[120px] group border border-fg/10 relative overflow-hidden"
          >
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                {mix.category === 'mood'
                  ? '気分'
                  : mix.category === 'activity'
                  ? '作業・行動'
                  : mix.category === 'genre'
                  ? 'ジャンル'
                  : '履歴発掘'}
              </span>
              <h3 className="text-sm font-bold text-fg group-hover:text-accent transition-colors leading-snug">
                {mix.title}
              </h3>
              <p className="text-[11px] text-muted line-clamp-2 mt-1">
                {mix.subtitle}
              </p>
            </div>

            <div className="flex items-center justify-between mt-3 relative z-10">
              <span className="text-[10px] text-accent font-semibold">
                タップでシャッフル
              </span>
              <div className="w-8 h-8 rounded-full bg-fg/10 group-hover:bg-accent group-hover:text-on-accent text-fg-soft flex items-center justify-center transition-colors shadow-sm">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
