import React from 'react';
import { Check, Palette } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { THEMES, THEME_GROUP_LABELS, ThemeGroup, getTheme } from '../utils/theme';

const GROUPS: ThemeGroup[] = ['accent', 'mono', 'metal', 'gradient', 'light'];

export const ThemePicker: React.FC = () => {
  const { themeId, setThemeId } = usePlayer();
  const current = getTheme(themeId);
  return (
    <div className="mb-5 p-3 rounded-2xl apple-card">
      <div className="flex items-center gap-2 mb-1.5">
        <Palette className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-bold text-fg">テーマ</h3>
        {/* 選択中のテーマ名（各丸の名前は常時表示しない） */}
        <span className="ml-auto text-xs font-semibold text-muted truncate" aria-live="polite">
          {current.name}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="text-[10px] font-semibold text-muted">{THEME_GROUP_LABELS[g]}</p>
            <div className="flex flex-wrap">
              {THEMES.filter((t) => t.group === g).map((t) => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeId(t.id)}
                    // タップ領域は 40x40px。見た目の丸は 32px
                    className="w-10 h-10 flex items-center justify-center active:scale-95 transition"
                    aria-label={t.name}
                    aria-pressed={active}
                  >
                    {/* 背景色の円 + 中央にアクセント色の小円 */}
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                        active ? 'border-transparent ring-2 ring-accent ring-offset-2 ring-offset-transparent' : 'border-fg/20'
                      }`}
                      style={{ background: t.appBg }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: t.accentGrad && t.accentGrad !== 'none' ? t.accentGrad : t.accent }}
                      >
                        {active && <Check className="w-2.5 h-2.5" strokeWidth={4} style={{ color: t.onAccent }} />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
