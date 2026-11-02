import React, { useEffect } from 'react';
import { loadYoutubeUsage, useYoutubeUsage } from '../utils/youtubeApi';

/** 設定画面の小さな「今日の使用量」表示（YouTube Data API の概算ユニット） */
export const YoutubeUsageNote: React.FC = () => {
  const u = useYoutubeUsage();
  useEffect(() => {
    void loadYoutubeUsage();
  }, []);

  const over = u.exhausted || u.units >= u.limit;
  return (
    <div className="mb-5 px-1">
      <p className={`text-[10px] leading-relaxed tabular-nums ${over ? 'text-red-500 font-semibold' : 'text-muted'}`}>
        YouTube API 今日の使用量（概算）: {u.units.toLocaleString()} / {u.limit.toLocaleString()} ユニット（{u.calls}回）
      </p>
      {over && (
        <p className="text-[10px] leading-relaxed text-red-500">
          1日の上限に達しました。日本時間の16〜17時ごろにリセットされます。
        </p>
      )}
      {!over && u.lastError && <p className="text-[10px] leading-relaxed text-red-500">{u.lastError}</p>}
    </div>
  );
};
