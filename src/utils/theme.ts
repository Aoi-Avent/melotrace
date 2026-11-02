/**
 * テーマ定義。色は「アクセント色」だけでなく、背景・カード・文字色までまとめて切り替える。
 * 画面側は text-fg / bg-surface / text-muted などのトークン経由で色を参照している。
 */
export type ThemeGroup = 'accent' | 'mono' | 'metal' | 'gradient' | 'light';

export interface ThemeDef {
  id: string;
  name: string;
  group: ThemeGroup;
  mode: 'dark' | 'light';
  accent: string;
  hover: string;
  onAccent: string;
  accentGrad?: string; // 塗りつぶしボタンなどに使うグラデーション（メタル系）
  appBg: string; // 画面全体の背景（グラデーション可）
  appBgSolid: string; // 背景の代表色（ブラウザの背景やテーマカラー用）
  surface: string;
  surface2: string;
  surface3: string;
  fg: string;
  fgSoft: string;
  muted: string;
  inverse: string;
  glass: string;
  navGlass: string;
  mini: string;
}

const DARK = {
  mode: 'dark' as const,
  fg: '#f5f5f7',
  fgSoft: '#d1d1d6',
  muted: '#8e8e93',
  inverse: '#000000',
  glass: 'rgba(28, 28, 30, 0.78)',
  navGlass: 'rgba(20, 20, 22, 0.86)',
  mini: 'rgba(36, 36, 38, 0.88)',
};
const DARK_OPAQUE = { surface: '#1c1c1e', surface2: '#2c2c2e', surface3: '#3a3a3c' };
// グラデーション背景の上でも背景が透けるよう、カードは半透明にする
const DARK_GLASS = { surface: 'rgba(255,255,255,0.075)', surface2: 'rgba(255,255,255,0.12)', surface3: 'rgba(255,255,255,0.18)' };

const LIGHT = {
  mode: 'light' as const,
  fg: '#1c1c1e',
  fgSoft: '#3a3a3c',
  muted: '#6e6e73',
  inverse: '#ffffff',
  glass: 'rgba(255, 255, 255, 0.8)',
  navGlass: 'rgba(255, 255, 255, 0.88)',
  mini: 'rgba(255, 255, 255, 0.92)',
};

function accentOnly(id: string, name: string, accent: string, hover: string): ThemeDef {
  return { id, name, group: 'accent', ...DARK, ...DARK_OPAQUE, accent, hover, onAccent: '#ffffff', appBg: '#000000', appBgSolid: '#000000' };
}
function grad(
  id: string, name: string, group: ThemeGroup, bg: [string, string, string?], accent: string, hover: string,
  onAccent = '#ffffff', accentGrad?: string
): ThemeDef {
  const appBg = `linear-gradient(165deg, ${bg[0]} 0%, ${bg[2] ?? bg[1]} 55%, ${bg[1]} 100%)`;
  return { id, name, group, ...DARK, ...DARK_GLASS, accent, hover, onAccent, accentGrad, appBg, appBgSolid: bg[1] };
}
function light(
  id: string, name: string, bg: [string, string], accent: string, hover: string, extra: Partial<ThemeDef> = {}
): ThemeDef {
  return {
    id, name, group: 'light', ...LIGHT, surface: '#ffffff', surface2: '#ececf1', surface3: '#dcdce3',
    accent, hover, onAccent: '#ffffff', appBg: `linear-gradient(170deg, ${bg[0]} 0%, ${bg[1]} 100%)`, appBgSolid: bg[0], ...extra,
  };
}

export const THEMES: ThemeDef[] = [
  // 単色アクセント（背景は黒）
  accentOnly('blue', 'ブルー', '#0a84ff', '#409cff'),
  accentOnly('teal', 'ティール', '#30b0c7', '#5ac8d8'),
  accentOnly('green', 'グリーン', '#30d158', '#5ee07a'),
  accentOnly('purple', 'パープル', '#af52de', '#c27ae8'),
  accentOnly('pink', 'ピンク', '#ff2d95', '#ff5cae'),
  accentOnly('red', 'レッド', '#fa2d48', '#ff3b56'),
  accentOnly('orange', 'オレンジ', '#ff9f0a', '#ffb340'),

  // モノトーン
  { id: 'ink', name: 'ブラック', group: 'mono', ...DARK, ...DARK_OPAQUE, accent: '#f5f5f7', hover: '#ffffff', onAccent: '#000000', appBg: '#000000', appBgSolid: '#000000' },
  grad('graphite', 'グレー', 'mono', ['#2b2d32', '#16171a'], '#c9ccd3', '#e2e4e9', '#101114'),

  // メタル
  grad('steel', 'スチール', 'metal', ['#2c333b', '#12151a', '#181c22'], '#cfd5de', '#e9edf3', '#0d0f12',
    'linear-gradient(135deg, #f4f6f9 0%, #a3abb8 48%, #e6eaf0 100%)'),
  grad('gold', 'ゴールド', 'metal', ['#33270c', '#100c05', '#1c1507'], '#e8c36a', '#f3d68a', '#1a1204',
    'linear-gradient(135deg, #fbe7a1 0%, #c79a3b 50%, #f1d27c 100%)'),
  grad('copper', 'カッパー', 'metal', ['#3a2116', '#120a07', '#1d110b'], '#e39a73', '#f0b394', '#1c0e07',
    'linear-gradient(135deg, #f6c3a5 0%, #bd6b45 50%, #eaa886 100%)'),

  // グラデーション
  grad('sunrise', 'サンライズ', 'gradient', ['#3a0f1c', '#0b0407', '#1b0810'], '#ff7a45', '#ff9566', '#1b0904',
    'linear-gradient(135deg, #ffb36b 0%, #ff5e62 100%)'),
  grad('seaglass', 'シーグラス', 'gradient', ['#06303a', '#1d0b33', '#0b1a33'], '#3ddbc3', '#6ae8d4', '#031614',
    'linear-gradient(135deg, #3ddbc3 0%, #8f6bff 100%)'),
  grad('mint', 'ミントチップ', 'gradient', ['#073324', '#0a1738', '#08241f'], '#4be3a0', '#78eebb', '#03180f',
    'linear-gradient(135deg, #4be3a0 0%, #38bdf8 100%)'),
  grad('raspberry', 'ラズベリー', 'gradient', ['#3a0820', '#12030a', '#220512'], '#ff4d8d', '#ff7aa9', '#ffffff',
    'linear-gradient(135deg, #ff4d8d 0%, #c026d3 100%)'),
  grad('aurora', 'オーロラ', 'gradient', ['#05192f', '#1c0b38', '#0a1230'], '#7c9cff', '#a0b8ff', '#ffffff',
    'linear-gradient(135deg, #5eead4 0%, #a78bfa 100%)'),
  grad('lemonlime', 'レモンライム', 'gradient', ['#2a3406', '#071607', '#10200a'], '#c8f05a', '#dcf88a', '#121a02',
    'linear-gradient(135deg, #f5e663 0%, #6ee06e 100%)'),
  grad('twilight', 'トワイライト', 'gradient', ['#1d1148', '#3a0f35', '#2b1042'], '#ff9ad5', '#ffb6e2', '#2a0a1f',
    'linear-gradient(135deg, #ffb88c 0%, #ff6fb5 100%)'),

  // ライト系
  light('paper', 'ホワイト', ['#f5f5f7', '#ebebf0'], '#0a84ff', '#0071e3'),
  light('mono-light', 'モノクロ', ['#fafafa', '#e9e9ec'], '#1c1c1e', '#3a3a3c'),
  light('fuwamochi', 'ふわもち', ['#fbf3e6', '#f3e4cf'], '#e8884a', '#d9743a', { surface: '#fffaf1', surface2: '#f4e6d2', surface3: '#ead8bf', fg: '#3b2f22', fgSoft: '#5a4a38', muted: '#8a7a66' }),
  light('peach', 'ピーチ', ['#fff3ee', '#ffe2ee'], '#ff6f91', '#f0557b'),
  light('mintcream', 'ミントクリーム', ['#ecfaf2', '#e3f1ff'], '#18b087', '#0f9a74'),
  light('lavender', 'ラベンダー', ['#f4efff', '#e8efff'], '#8b5cf6', '#7a47ee'),
];

export const THEME_GROUP_LABELS: Record<ThemeGroup, string> = {
  accent: '単色アクセント',
  mono: 'モノトーン',
  metal: 'メタル',
  gradient: 'グラデーション',
  light: 'ライト',
};

export const DEFAULT_THEME_ID = 'red';
const MUSIC_MIGRATE_KEY = 'melotrace_theme_music_v1';
export const THEME_STORAGE_KEY = 'melotrace_theme_v1';
const VARS_KEY = 'melotrace_theme_vars_v1';

export function getTheme(id: string | null | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function getSavedThemeId(): string {
  try {
    // 新しいUI（ミュージック風）に切り替わった最初の1回だけ、赤のテーマにする。以後は自分で選んだテーマを保つ
    if (!localStorage.getItem(MUSIC_MIGRATE_KEY)) {
      localStorage.setItem(MUSIC_MIGRATE_KEY, '1');
      localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME_ID);
      return DEFAULT_THEME_ID;
    }
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch (e) {}
  return DEFAULT_THEME_ID;
}

export function themeVars(t: ThemeDef): Record<string, string> {
  return {
    '--accent': t.accent,
    '--accent-hover': t.hover,
    '--on-accent': t.onAccent,
    '--accent-grad': t.accentGrad ?? 'none',
    '--app-bg': t.appBg,
    '--app-bg-solid': t.appBgSolid,
    '--fg': t.fg,
    '--fg-soft': t.fgSoft,
    '--muted': t.muted,
    '--inverse': t.inverse,
    '--surface': t.surface,
    '--surface-2': t.surface2,
    '--surface-3': t.surface3,
    '--glass': t.glass,
    '--nav-glass': t.navGlass,
    '--mini-bg': t.mini,
  };
}

export function applyTheme(id: string) {
  const t = getTheme(id);
  const root = document.documentElement;
  const vars = themeVars(t);
  for (const k in vars) root.style.setProperty(k, vars[k]);
  root.style.colorScheme = t.mode;
  root.setAttribute('data-theme-mode', t.mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.appBgSolid);
  try {
    // 次回の起動時、読み込み直後に同じ色を適用して「一瞬ちがう色が見える」のを防ぐ
    localStorage.setItem(VARS_KEY, JSON.stringify({ vars, mode: t.mode, solid: t.appBgSolid }));
  } catch (e) {}
}
