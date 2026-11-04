import React from 'react';
import { SHORT_FILTER_OPTIONS, setShortFilterSec, useShortFilterSec } from '../utils/shortFilter';

export const ShortTrackFilterCard: React.FC = () => {
  const sec = useShortFilterSec();
  return (
    <div className="mb-5 p-4 rounded-2xl apple-card">
      <p className="text-sm font-bold text-fg">短い曲を除外</p>
      <p className="text-[10px] text-muted mt-1 leading-relaxed">短い動画や効果音を、一覧や再生の候補から外します</p>
      <div className="flex flex-wrap gap-2 mt-3" role="radiogroup" aria-label="短い曲を除外">
        {SHORT_FILTER_OPTIONS.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={sec === v}
            onClick={() => setShortFilterSec(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${sec === v ? 'bg-[#30d158] text-black' : 'bg-surface-3 text-fg'}`}
          >
            {v === 0 ? 'オフ' : `${v}秒以下`}
          </button>
        ))}
      </div>
    </div>
  );
};
