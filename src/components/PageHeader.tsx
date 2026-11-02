import React from 'react';
import { ChevronLeft, UserRound } from 'lucide-react';
import { navSetTab, navBack } from '../utils/nav';

interface PageHeaderProps {
  title: string;
  /** 戻るボタンを出す（階層の下の画面） */
  onBack?: boolean;
  /** 右上に並べる操作（ガラスの丸いボタンなど） */
  actions?: React.ReactNode;
  /** 右上のアカウントボタン（設定へ）。階層の下の画面では出さない */
  avatar?: boolean;
  subtitle?: string;
}

/** 右上の丸いボタン用（ガラス） */
export const GlassCircle: React.FC<{ onClick?: () => void; label: string; children: React.ReactNode }> = ({ onClick, label, children }) => (
  <button onClick={onClick} aria-label={label} className="lg-glass w-10 h-10 rounded-full flex items-center justify-center text-fg active:scale-90 transition-transform shrink-0">
    {children}
  </button>
);

/** 「…」「並び替え」などをまとめる、ガラスのカプセル */
export const GlassPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="lg-glass h-10 rounded-full flex items-center px-1 shrink-0">{children}</div>
);

/** ミュージック風の、大きなタイトル付きの見出し */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, onBack, actions, avatar = true, subtitle }) => {
  const avatarBtn = avatar && (
    <button
      onClick={() => navSetTab('import')}
      aria-label="設定とアカウント"
      className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-on-accent active:scale-90 transition-transform shrink-0"
      style={{ background: 'var(--accent-grad, none), var(--accent)' }}
    >
      <UserRound className="w-5 h-5" />
    </button>
  );
  if (onBack) {
    return (
      <header className="pt-1 pb-2">
        <div className="flex items-center justify-between h-12">
          <GlassCircle onClick={navBack} label="戻る">
            <ChevronLeft className="w-5 h-5" />
          </GlassCircle>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
        <h1 className="mt-large-title text-fg mt-1">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </header>
    );
  }
  return (
    <header className="pt-1 pb-2">
      <div className="flex items-center justify-between min-h-12">
        <h1 className="mt-large-title text-fg">{title}</h1>
        <div className="flex items-center gap-2">
          {actions}
          {avatarBtn}
        </div>
      </div>
      {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
    </header>
  );
};
