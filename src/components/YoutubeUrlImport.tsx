import React, { useRef, useState } from 'react';
import { Link2, Loader2, Square, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { MusicTrack } from '../types/music';
import { isLikelyMusic, extractSmartTrackMeta, classifyMusicGenre } from '../utils/parser';
import { YoutubeApiError, YtPlaylistVideo, findChannel, getPlaylistPage } from '../utils/youtubeApi';
import {
  UrlImportError,
  YtTarget,
  parseYoutubeTarget,
  targetLabel,
  uploadsPlaylistIdOf,
} from '../utils/youtubeUrl';

/** 1回の取り込みで読むページ数の上限（50件 × 40 = 2,000件）。クォータ保護用。 */
const MAX_PAGES = 40;

const nowStr = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

function toTrack(v: YtPlaylistVideo): MusicTrack {
  const meta = extractSmartTrackMeta(v.title, v.channelTitle);
  const now = nowStr();
  return {
    id: v.videoId,
    title: meta.cleanTitle,
    artist: meta.cleanArtist,
    channelId: v.channelId || undefined,
    genre: classifyMusicGenre(v.title, v.channelTitle),
    playCount: 1,
    lastPlayed: now,
    firstPlayed: now,
    isFavorite: false,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  };
}

interface Progress {
  label: string;
  pages: number;
  scanned: number;
  added: number;
  skippedNonMusic: number;
  alreadyHad: number;
}

type Phase = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export const YoutubeUrlImport: React.FC = () => {
  const { tracks, strictnessMode, appendTracks, createPlaylist } = usePlayer();
  const [url, setUrl] = useState('');
  const [makePlaylist, setMakePlaylist] = useState(true);
  const [playlistName, setPlaylistName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState('');
  const cancelRef = useRef(false);

  const running = phase === 'running';

  const run = async () => {
    cancelRef.current = false;
    setMessage('');
    setProgress(null);

    // 1) URLの判定（ここで失敗したら、何が悪いかをそのまま出す）
    let target: YtTarget;
    try {
      target = parseYoutubeTarget(url);
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof UrlImportError ? e.message : 'URLを判定できませんでした。');
      return;
    }

    const prog: Progress = {
      label: targetLabel(target),
      pages: 0,
      scanned: 0,
      added: 0,
      skippedNonMusic: 0,
      alreadyHad: 0,
    };
    setProgress({ ...prog });
    setPhase('running');

    const known = new Set(tracks.map((t) => t.id));
    const playlistIds: string[] = [];
    const seenInPlaylist = new Set<string>();
    let firstChannelTitle = '';
    let sourceName = '';

    try {
      // 2) 取得元のプレイリストIDを決める
      let playlistId: string;
      if (target.kind === 'playlist') {
        playlistId = target.playlistId;
      } else if (target.kind === 'channelId') {
        playlistId = uploadsPlaylistIdOf(target.channelId);
      } else {
        const ch = await findChannel(target.kind === 'handle' ? { handle: target.handle } : { username: target.username });
        if (!ch) {
          throw new UrlImportError(
            target.kind === 'handle'
              ? `${targetLabel(target)} が見つかりませんでした。@ハンドルの綴りを確認するか、/channel/UC… 形式のURLを試してください。旧形式の /c/名前 のURLは解決できない場合があります。`
              : `${targetLabel(target)} が見つかりませんでした。/user/ 形式は古いチャンネルのみ有効です。@ハンドルか /channel/UC… 形式のURLを試してください。`,
          );
        }
        if (!ch.uploadsPlaylistId) {
          throw new UrlImportError(`チャンネル「${ch.title}」の動画一覧を取得できませんでした（アップロード一覧が公開されていません）。`);
        }
        playlistId = ch.uploadsPlaylistId;
        sourceName = ch.title;
        prog.label = `チャンネル「${ch.title}」`;
        setProgress({ ...prog });
      }

      // 3) 50件ずつ取得 → 音楽判定 → ライブラリへ追加
      let pageToken: string | undefined;
      let hitLimit = false;
      do {
        if (cancelRef.current) break;
        if (prog.pages >= MAX_PAGES) {
          hitLimit = true;
          break;
        }
        const page = await getPlaylistPage(playlistId, pageToken);
        prog.pages += 1;
        prog.scanned += page.items.length;

        const batch: MusicTrack[] = [];
        for (const v of page.items) {
          if (seenInPlaylist.has(v.videoId)) continue;
          // 「◯◯ - Topic」は YouTube が自動生成する音楽チャンネルなので、判定せず音楽として扱う
          const isTopic = /\s-\sTopic$/i.test(v.channelTitle);
          if (!isTopic && !isLikelyMusic(v.title, v.channelTitle, undefined, strictnessMode)) {
            prog.skippedNonMusic += 1;
            continue;
          }
          seenInPlaylist.add(v.videoId);
          playlistIds.push(v.videoId);
          if (!firstChannelTitle && v.channelTitle) firstChannelTitle = v.channelTitle.replace(/\s-\sTopic$/i, '');
          if (known.has(v.videoId)) {
            prog.alreadyHad += 1;
            continue;
          }
          known.add(v.videoId);
          batch.push(toTrack(v));
        }
        if (batch.length) {
          appendTracks(batch);
          prog.added += batch.length;
        }
        setProgress({ ...prog });
        pageToken = page.nextPageToken;
      } while (pageToken);

      // 4) プレイリスト作成（キャンセル時も、ここまでに見つかった曲で作る）
      let plMsg = '';
      if (makePlaylist && playlistIds.length > 0) {
        const name =
          playlistName.trim() ||
          (target.kind === 'playlist'
            ? `YouTubeプレイリスト ${nowStr().slice(0, 10)}`
            : sourceName || firstChannelTitle || `YouTubeチャンネル ${nowStr().slice(0, 10)}`);
        createPlaylist(name, 'YouTubeのURLから取り込み', undefined, playlistIds);
        plMsg = `プレイリスト「${name}」を作成しました（${playlistIds.length}曲）。`;
      }

      const wasCancelled = cancelRef.current;
      setPhase(wasCancelled ? 'cancelled' : 'done');
      const parts = [
        wasCancelled ? 'キャンセルしました。' : '取り込みが完了しました。',
        `追加 ${prog.added}曲`,
        prog.alreadyHad ? `（登録済み ${prog.alreadyHad}曲）` : '',
        prog.skippedNonMusic ? ` / 音楽以外と判定して除外 ${prog.skippedNonMusic}件` : '',
        hitLimit ? ` / 上限（${MAX_PAGES * 50}件）で停止しました。` : '',
      ];
      setMessage(parts.join('') + (plMsg ? ` ${plMsg}` : ''));
      if (prog.scanned === 0 && !wasCancelled) {
        setPhase('error');
        setMessage(`${prog.label} には取得できる動画がありませんでした。非公開・削除済み、または動画が1本もない可能性があります。`);
      } else if (prog.added === 0 && prog.alreadyHad === 0 && !wasCancelled && prog.scanned > 0) {
        setMessage(
          `${prog.scanned}件を確認しましたが、音楽と判定された動画がありませんでした。上の「音楽判定の厳格度」を「すべて」に変えると取り込めることがあります。`,
        );
      }
    } catch (e) {
      setPhase('error');
      const added = prog.added ? `（ここまでに ${prog.added}曲 を追加済み）` : '';
      if (e instanceof UrlImportError) {
        setMessage(e.message + added);
      } else if (e instanceof YoutubeApiError) {
        const kindNote =
          e.code === 'NOT_FOUND'
            ? `${prog.label} が見つかりません。非公開・削除済みか、URLの種類が違う可能性があります（判定: ${targetLabel(target)}）。`
            : e.message;
        setMessage(kindNote + added);
      } else {
        setMessage('取り込み中に予期しないエラーが発生しました。' + added);
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!running) void run();
  };

  return (
    <section className="mb-6 p-5 rounded-2xl apple-card border border-fg/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent" />
          <span>YouTubeのURLから追加</span>
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fg/10 text-fg-soft font-semibold">
          50件ずつ取得
        </span>
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">
        プレイリスト、チャンネル（@ハンドル / channel）、「◯◯ - Topic」チャンネルのURLを貼り付けると、曲をライブラリに追加します。音楽判定は上の厳格度設定に従います。
      </p>

      <form onSubmit={onSubmit} className="space-y-2.5">
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={running}
          placeholder="https://www.youtube.com/playlist?list=…"
          className="w-full px-3 py-2.5 rounded-xl bg-fg/10 text-xs text-fg placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-60"
        />

        <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
          <input
            type="checkbox"
            checked={makePlaylist}
            onChange={(e) => setMakePlaylist(e.target.checked)}
            disabled={running}
            className="w-4 h-4 accent-[var(--color-accent,#0a84ff)]"
          />
          <span>追加した曲をプレイリストにもまとめる</span>
        </label>

        {makePlaylist && (
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            disabled={running}
            placeholder="プレイリスト名（空欄なら自動）"
            className="w-full px-3 py-2 rounded-xl bg-fg/10 text-xs text-fg placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-60"
          />
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={running || !url.trim()}
            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            <span>{running ? '取得中…' : '取り込む'}</span>
          </button>
          {running && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="px-4 py-2.5 rounded-xl bg-fg/10 hover:bg-fg/15 text-fg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              <span>キャンセル</span>
            </button>
          )}
        </div>
      </form>

      {progress && (
        <div className="mt-3 text-[11px] text-fg-soft leading-relaxed tabular-nums" aria-live="polite">
          <p className="font-semibold text-fg">判定: {progress.label}</p>
          <p>
            {progress.pages}ページ（{progress.scanned}件）確認 / 追加 {progress.added}曲
            {progress.alreadyHad > 0 && ` / 登録済み ${progress.alreadyHad}曲`}
            {progress.skippedNonMusic > 0 && ` / 除外 ${progress.skippedNonMusic}件`}
          </p>
        </div>
      )}

      {message && (
        <p
          className={`mt-2 text-xs leading-relaxed flex items-start gap-1.5 ${
            phase === 'error' ? 'text-red-500' : 'text-fg'
          }`}
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {phase === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-px text-[#30d158]" />
          )}
          <span>{message}</span>
        </p>
      )}
    </section>
  );
};
