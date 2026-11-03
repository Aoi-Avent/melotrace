import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, ChevronDown } from 'lucide-react';
import {
  loadYoutubeUsage,
  setYoutubeApiKey,
  useYoutubeApiKeySource,
  useYoutubeUsage,
  verifyYoutubeApiKey,
  YoutubeApiError,
} from '../utils/youtubeApi';

// 検索画面の「キー入力カードへのリンク」から開いたとき、取込タブでこのカードまで案内するための小さな合図
let focusRequested = false;
export function requestKeyCardFocus(): void {
  focusRequested = true;
}
export function peekKeyCardRequest(): boolean {
  return focusRequested;
}

const SOURCE_LABEL = { user: 'あなたのキー', build: '共有キー', none: '未設定' } as const;

type Check = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' } | { kind: 'rejected' } | { kind: 'error'; message: string };

/** 取込タブの「YouTube APIキー」カード。キーはこの端末の localStorage にだけ保存する（同期・書き出しには含めない） */
export const YoutubeApiKeyCard: React.FC = () => {
  const source = useYoutubeApiKeySource();
  const usage = useYoutubeUsage();
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<Check>({ kind: 'idle' });
  const [notice, setNotice] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadYoutubeUsage();
  }, []);

  useEffect(() => {
    if (!focusRequested) return;
    focusRequested = false;
    const t = window.setTimeout(() => rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    return () => window.clearTimeout(t);
  }, []);

  const typed = input.trim();
  const canVerify = (!!typed || source === 'user') && check.kind !== 'busy';

  const save = () => {
    if (!typed) return;
    setYoutubeApiKey(typed);
    setInput('');
    setShow(false);
    setCheck({ kind: 'idle' });
    setNotice('保存しました。');
  };

  const remove = () => {
    setYoutubeApiKey('');
    setInput('');
    setCheck({ kind: 'idle' });
    setNotice('削除しました。');
  };

  const verify = async () => {
    if (!canVerify) return;
    setNotice('');
    setCheck({ kind: 'busy' });
    try {
      const ok = await verifyYoutubeApiKey(typed || undefined);
      setCheck({ kind: ok ? 'ok' : 'rejected' });
    } catch (e) {
      // YoutubeApiError の文言にはキーは含まれない
      setCheck({ kind: 'error', message: e instanceof YoutubeApiError ? e.message : '確認できませんでした。' });
    }
  };

  return (
    <div ref={rootRef} id="yt-api-key-card" className="mb-5 rounded-2xl apple-card border border-fg/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-bold text-fg">YouTube APIキー</h3>
      </div>
      <p className="text-[11px] text-muted leading-relaxed mb-3">
        現在: <span className="font-semibold text-fg">{SOURCE_LABEL[source]}</span>
        <span className="tabular-nums">
          {' '}／ 今日の使用量（概算） {usage.units.toLocaleString()} / {usage.limit.toLocaleString()} ユニット
        </span>
      </p>

      <div className="flex gap-2 mb-2">
        <div className="relative flex-1 min-w-0">
          <input
            type={show ? 'text' : 'password'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setNotice('');
            }}
            placeholder={source === 'user' ? '新しいキーに置き換える' : 'APIキーを貼る'}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-3 pr-10 py-2 rounded-lg bg-fg/10 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-muted"
            aria-label={show ? 'キーを隠す' : 'キーを表示'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={save}
          disabled={!typed}
          className="px-3 py-2 rounded-lg bg-fg/10 text-accent text-sm font-semibold disabled:opacity-40"
        >
          保存
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={verify}
          disabled={!canVerify}
          className="px-3 py-1.5 rounded-full bg-fg/10 text-fg text-xs font-semibold disabled:opacity-40"
        >
          {check.kind === 'busy' ? '確認中…' : 'キーを確認（1ユニット）'}
        </button>
        {source === 'user' && (
          <button onClick={remove} className="px-3 py-1.5 rounded-full bg-fg/10 text-red-400 text-xs font-semibold">
            削除
          </button>
        )}
        {check.kind === 'ok' && <span className="text-xs text-accent font-semibold">使えます</span>}
        {check.kind === 'rejected' && <span className="text-xs text-red-400 font-semibold">拒否されました</span>}
        {notice && <span className="text-xs text-muted">{notice}</span>}
      </div>
      {check.kind === 'error' && <p className="text-[11px] text-red-400 mt-2 leading-relaxed">{check.message}</p>}
      {check.kind === 'rejected' && (
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          キーの値、YouTube Data API v3の有効化、「APIの制限」の設定を確認してください。
        </p>
      )}

      <p className="text-[11px] text-muted leading-relaxed mt-3">
        キーはこの端末にだけ保存され、他の端末やクラウドには送られません。YouTube全体の検索は、あなた自身のキーのときだけ使えます（1回の検索で約101ユニット）。
      </p>

      <details className="mt-2 group">
        <summary className="flex items-center gap-1 text-[11px] text-accent font-semibold cursor-pointer list-none">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          キーの取得手順
        </summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-[11px] text-muted leading-relaxed">
          <li>Google Cloud Console でプロジェクトを作り、「YouTube Data API v3」を有効にする。</li>
          <li>「認証情報」から「APIキー」を作成する。</li>
          <li>キーの「APIの制限」で「キーを制限」を選び、YouTube Data API v3 だけにする。</li>
        </ol>
        <p className="text-[11px] text-muted leading-relaxed mt-1">
          iOSアプリではHTTPリファラ制限が効かず拒否されることがあるため、制限は「APIの制限」だけにするのが無難です。
        </p>
      </details>
    </div>
  );
};
