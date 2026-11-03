import { PageHeader } from './PageHeader';
import React, { useState } from 'react';
import {
  Sparkles,
  Upload,
  ArrowDownToLine,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Download,
  ExternalLink,
  HelpCircle,
  Check,
  Plus,
  ShieldCheck,
  Ban,
  Filter,
  Volume2,
  ShieldAlert,
  Copy,
  Code2,
  FileCode,
  ChevronDown,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { parseTakeoutJson } from '../utils/parser';
import { parseMhtmlToWatchHistory, MhtmlExtractionResult } from '../utils/mhtmlParser';
import { MusicTrack, ActiveTab } from '../types/music';
import { BackgroundPlayButton } from './BackgroundGuide';
import { AccountCard } from './AccountCard';
import { openArtistOnboarding } from './ArtistOnboarding';
import { ThemePicker } from './ThemePicker';
import { AppearanceCard } from './AppearanceCard';
import { ExtensionGuideCard } from './ExtensionGuideCard';
import { ArtistFilterToggle } from './ArtistFilterToggle';
import { PlayDiagnostics } from './PlayDiagnostics';
import { unzipSync } from 'fflate';
import { saveTextFile } from '../utils/nativeFile';
import { isNativeApp } from '../utils/platform';
import { ThumbSettings } from './ThumbSettings';
import { YoutubeUsageNote } from './YoutubeUsageNote';
import { YoutubeUrlImport } from './YoutubeUrlImport';

const GITHUB_ACTIONS_WORKFLOW_YAML = `name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build project
        run: npm run build

      - name: Setup GitHub Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

interface DataImportViewProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const DataImportView: React.FC<DataImportViewProps> = ({ setActiveTab }) => {
  const {
    tracks,
    activeTracks,
    isDemoMode,
    bannedArtists,
    bannedTracks,
    strictnessMode,
    setStrictnessMode,
    unbanArtist,
    unbanTrack,
    clearAllBans,
    loadDemoData,
    importTracks,
    clearAllData,
    addSingleTrackByUrl,
  } = usePlayer();

  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [demoLoadedSuccess, setDemoLoadedSuccess] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBannedModal, setShowBannedModal] = useState(false);

  // MHTML Extractor state
  const [mhtmlResult, setMhtmlResult] = useState<MhtmlExtractionResult | null>(null);
  const [mhtmlExtractedTracks, setMhtmlExtractedTracks] = useState<MusicTrack[]>([]);
  const [isProcessingMhtml, setIsProcessingMhtml] = useState(false);
  const [mhtmlSuccessMsg, setMhtmlSuccessMsg] = useState<string | null>(null);

  // Single URL add state
  const [quickUrl, setQuickUrl] = useState('');
  const [quickAddSuccess, setQuickAddSuccess] = useState(false);
  const [copiedWorkflow, setCopiedWorkflow] = useState(false);
  const [showGithubGuide, setShowGithubGuide] = useState(false);

  // Load demo data handler
  const handleLoadDemo = () => {
    loadDemoData();
    setDemoLoadedSuccess(true);
    setTimeout(() => {
      setDemoLoadedSuccess(false);
      setActiveTab('home');
    }, 1000);
  };

  // Dedicated MHTML File Processor
  const processMhtmlFile = async (file: File) => {
    setIsProcessingMhtml(true);
    setMhtmlSuccessMsg(null);
    setErrorMessage(null);
    await new Promise((r) => setTimeout(r, 100));

    try {
      const text = await file.text();
      const res = parseMhtmlToWatchHistory(text);

      if (!res.success || res.entries.length === 0) {
        setErrorMessage(res.errorMessage || 'MHTML/HTMLファイルからYouTube履歴を検出できませんでした。');
        setIsProcessingMhtml(false);
        return;
      }

      const parsedTracks = parseTakeoutJson(res.jsonContent, strictnessMode);
      setMhtmlResult(res);
      setMhtmlExtractedTracks(parsedTracks);
      setMhtmlSuccessMsg(
        `抽出成功！全${res.totalExtracted.toLocaleString()}件の履歴から、音楽・ボカロ等${parsedTracks.length.toLocaleString()}曲を検出しました。`
      );
    } catch (err: any) {
      setErrorMessage('MHTML解析エラー: ' + (err?.message || '不明なエラー'));
    } finally {
      setIsProcessingMhtml(false);
    }
  };

  // Download extracted JSON file with timestamped name
  const handleDownloadMhtmlJson = async () => {
    if (!mhtmlResult) return;
    try {
      await saveTextFile(mhtmlResult.filename, mhtmlResult.jsonContent);
    } catch (err: any) {
      setErrorMessage('ファイルの保存に失敗しました: ' + (err?.message || '不明なエラー'));
    }
  };

  // Import extracted MHTML tracks to library
  const handleImportMhtmlTracks = () => {
    if (mhtmlExtractedTracks.length === 0) return;
    importTracks(mhtmlExtractedTracks);
    setImportResult(
      `MHTMLから${mhtmlExtractedTracks.length.toLocaleString()}曲をライブラリに取り込みました！IndexedDBに永続保存されました。`
    );
  };

  // Handle general file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setImportResult(null);
    setErrorMessage(null);

    // Yield to let React display spinner
    await new Promise((r) => setTimeout(r, 100));

    try {
      const fileName = file.name.toLowerCase();

      // Google Takeout の ZIP をそのまま選べるようにする（展開不要）。視聴履歴のJSONだけを取り出す
      if (fileName.endsWith('.zip')) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const entries = unzipSync(buf, {
          filter: (f) => /(視聴履歴|watch-history)[^/]*\.json$/i.test(f.name),
        });
        const names = Object.keys(entries);
        if (names.length === 0) {
          setErrorMessage(
            'ZIPの中に視聴履歴（視聴履歴.json / watch-history.json）が見つかりませんでした。Takeoutで「YouTube」の「履歴」を選び、形式を「JSON」にしてエクスポートしてください。'
          );
          return;
        }
        const zipTracks: MusicTrack[] = [];
        for (const n of names) {
          zipTracks.push(...parseTakeoutJson(new TextDecoder('utf-8').decode(entries[n]), strictnessMode));
          await new Promise((r) => setTimeout(r, 30));
        }
        if (zipTracks.length > 0) {
          importTracks(zipTracks);
          setImportResult(`ZIPから ${zipTracks.length.toLocaleString()}曲を取り込みました。`);
        } else {
          setErrorMessage('音楽データが検出されませんでした。');
        }
        return;
      }

      const text = await file.text();

      // Yield after reading text
      await new Promise((r) => setTimeout(r, 50));

      let extractedTracks: MusicTrack[] = [];

      if (fileName.endsWith('.json')) {
        // Parse Google Takeout watch-history.json with current strictness
        extractedTracks = parseTakeoutJson(text, strictnessMode);
      } else if (
        fileName.endsWith('.mhtml') ||
        fileName.endsWith('.mht') ||
        fileName.endsWith('.html') ||
        fileName.endsWith('.htm')
      ) {
        // Parse MHTML / Takeout HTML
        const res = parseMhtmlToWatchHistory(text);
        if (res.success && res.entries.length > 0) {
          setMhtmlResult(res);
          extractedTracks = parseTakeoutJson(res.jsonContent, strictnessMode);
          setMhtmlExtractedTracks(extractedTracks);
        } else {
          // Fallback: look for youtube links in text/html
          const matches = text.matchAll(/watch\?v=([a-zA-Z0-9_-]{11})/g);
          const map = new Map<string, number>();
          for (const m of matches) {
            const id = m[1];
            map.set(id, (map.get(id) || 0) + 1);
          }
          extractedTracks = Array.from(map.entries()).map(([id, count]) => ({
            id,
            title: `YouTube Track (${id})`,
            artist: '取り込み楽曲',
            genre: 'J-POP',
            playCount: count,
            lastPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
            firstPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
            isFavorite: count >= 3,
            thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          }));
        }
      } else {
        // Fallback: look for youtube links in text
        const matches = text.matchAll(/watch\?v=([a-zA-Z0-9_-]{11})/g);
        const map = new Map<string, number>();
        for (const m of matches) {
          const id = m[1];
          map.set(id, (map.get(id) || 0) + 1);
        }

        extractedTracks = Array.from(map.entries()).map(([id, count]) => ({
          id,
          title: `YouTube Track (${id})`,
          artist: '取り込み楽曲',
          genre: 'J-POP',
          playCount: count,
          lastPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
          firstPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
          isFavorite: count >= 3,
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        }));
      }

      await new Promise((r) => setTimeout(r, 50));

      if (extractedTracks.length > 0) {
        importTracks(extractedTracks);
        setImportResult(
          `インポート成功！${extractedTracks.length.toLocaleString()}曲の音楽・ボカロ・カバー楽曲を抽出・保存しました。高速IndexedDBに安全保管されているため、次回以降もフリーズせずスムーズに操作できます。`
        );
      } else {
        setErrorMessage(
          '音楽データが検出されませんでした。Google Takeoutの watch-history.json または視聴履歴.html / mhtml ファイルをお選びください。'
        );
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('ファイルの読み込み中にエラーが発生しました: ' + (err?.message || '不明なエラー'));
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Quick single URL add
  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    const ok = addSingleTrackByUrl(quickUrl.trim());
    if (ok) {
      setQuickAddSuccess(true);
      setQuickUrl('');
      setTimeout(() => setQuickAddSuccess(false), 1200);
    } else {
      alert('有効なYouTubeのURLを入力してください。');
    }
  };

  // Export JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tracks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `melotrace_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 「色テーマ」「同期」以外は、高度な設定にまとめる（最初のデータ取り込み前は、迷わないよう開いておく）
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => isDemoMode || activeTracks.length === 0);

  const handleCopyWorkflow = async () => {
    try {
      await navigator.clipboard.writeText(GITHUB_ACTIONS_WORKFLOW_YAML);
      setCopiedWorkflow(true);
      setTimeout(() => setCopiedWorkflow(false), 2500);
    } catch (e) {
      // fallback
    }
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="設定" onBack subtitle="色テーマ・同期・取り込みなど" />

      <ThemePicker />

      <AccountCard />

      <div className="mb-5 p-4 rounded-2xl apple-card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">好きなアーティスト</p>
          <p className="text-[10px] text-muted mt-1 leading-relaxed">候補から選んで、お気に入りのアーティストに追加します。</p>
        </div>
        <button
          onClick={openArtistOnboarding}
          className="shrink-0 py-2 px-3.5 rounded-full bg-fg/10 hover:bg-fg/15 text-accent text-xs font-semibold active:scale-95 transition-all"
        >
          好きなアーティストを選び直す
        </button>
      </div>

      {/* 高度な設定（色テーマ・同期以外のすべて） */}
      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="w-full mb-5 p-4 rounded-2xl apple-card border border-fg/10 flex items-center justify-between text-left active:scale-[0.99] transition"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">高度な設定</p>
          <p className="text-[11px] text-muted mt-0.5">データの取り込み・表示・除外・バックアップなど</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={advancedOpen ? '' : 'hidden'}>
        <BackgroundPlayButton compact className="mb-5" />

      <ThumbSettings />

      <AppearanceCard />

      <YoutubeUsageNote />

      {!isNativeApp() && <ExtensionGuideCard />}

      <div className="mb-5 p-4 rounded-2xl apple-card border border-fg/10">
        <h3 className="text-sm font-bold text-fg mb-1">表示するチャンネル</h3>
        <p className="text-[11px] text-muted leading-relaxed mb-3">
          「公式アーティストのみ」は、音楽カタログ（MusicBrainz・Apple）に実在を確認できたアーティストだけを表示します。個人チャンネルや配信者名などは対象外になります。判定は再生回数の多い順にバックグラウンドで進みます。
        </p>
        <ArtistFilterToggle />
      </div>

      <PlayDiagnostics />

      {/* Current Data & Ban Status Bar */}
      <div className="mb-5 p-3.5 rounded-xl apple-card border border-fg/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#30d158]" />
          <div>
            <p className="text-xs font-bold text-fg">
              {isDemoMode ? 'サンプル体験モード中' : 'マイデータ運用中'}
            </p>
            <p className="text-[11px] text-muted">
              有効楽曲: {activeTracks.length}曲
              {bannedArtists.length + bannedTracks.length > 0 &&
                ` (除外: ${bannedArtists.length + bannedTracks.length}件)`}
            </p>
          </div>
        </div>

        {bannedArtists.length + bannedTracks.length > 0 && (
          <button
            onClick={() => setShowBannedModal(true)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Banリスト管理
          </button>
        )}
      </div>

      {/* SECTION 1: HIGH-PRECISION MUSIC FILTER STRICTNESS */}
      <section className="mb-6 p-5 rounded-2xl apple-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
            <Filter className="w-4 h-4 text-accent" />
            <span>音楽判定の厳格度（切り抜き・雑談の徹底除外）</span>
          </h3>
        </div>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          YouTube履歴から「切り抜き」「まとめ」「雑談」「ゲーム実況」「配信アーカイブ」など不快な動画をどれくらい厳しく除外するかを設定できます。
        </p>

        <div className="grid grid-cols-3 gap-2">
          {[
            {
              id: 'strict',
              title: '厳格モード',
              desc: '公式MV・音源のみ (切り抜き徹底排除)',
            },
            {
              id: 'standard',
              title: '標準モード',
              desc: 'MV・ボカロ・歌ってみた・Cover',
            },
            {
              id: 'all',
              title: '全件モード',
              desc: '全履歴をそのまま保持',
            },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setStrictnessMode(mode.id as any)}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                strictnessMode === mode.id
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-fg/5 bg-white/[0.03] text-muted hover:text-fg'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">{mode.title}</span>
                {strictnessMode === mode.id && (
                  <Check className="w-3.5 h-3.5 text-accent" />
                )}
              </div>
              <p className="text-[10px] opacity-75 line-clamp-2 leading-tight">
                {mode.desc}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* SECTION 2: AD SUPPRESSION ARCHITECTURE */}
      <section className="mb-6 p-5 rounded-2xl apple-card">
        <h3 className="text-sm font-bold text-fg tracking-tight mb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#30d158]" />
          <span>広告ブロック & 広告なし再生の仕組み</span>
        </h3>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          アドオンが入っていないiPhoneのSafariやスマホ環境でも広告を最小化するよう特別設計されています。
        </p>

        <div className="flex flex-col gap-2 text-xs text-fg-soft">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-fg/5">
            <span className="font-bold text-fg block mb-0.5">1. YouTube NoCookie (プライバシー保護モード)</span>
            <span className="text-[11px] text-muted">
              ターゲティング広告トラッカーを遮断する専用ホスト経由でプレイヤーを初期化し、割り込み広告の頻度を劇的に引き下げています。
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-fg/5">
            <span className="font-bold text-fg block mb-0.5">2. バックグラウンドキュー＆シームレス自動送り</span>
            <span className="text-[11px] text-muted">
              プレイヤー枠を破棄せず1インスタンスで動画IDのみを高速切替するため、連続再生時の広告読み込みを大幅に抑制しています。
            </span>
          </div>
        </div>
      </section>

      {/* YouTube URL（プレイリスト／チャンネル）取り込み */}
      <YoutubeUrlImport />

      {/* SECTION 3: GOOGLE TAKEOUT JSON IMPORT */}
      {/* SECTION 2: JSON BACKUP & RESTORE */}
      <section className="mb-6 p-5 rounded-2xl apple-card border border-fg/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-accent" />
            <span>ライブラリの書き出しと読み込み (JSON)</span>
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-fg/10 text-fg-soft font-semibold">
            JSON
          </span>
        </div>
        <p className="text-xs text-muted mb-4 leading-relaxed">
          現在のライブラリデータをJSON形式で書き出したり、バックアップファイルから楽曲リストを読み込んで復元できます。
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleExportJson}
            className="py-3 px-3 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-accent/20"
          >
            <Download className="w-4 h-4" />
            <span>ライブラリを書き出す</span>
          </button>

          <label className="py-3 px-3 rounded-xl bg-fg/10 hover:bg-fg/15 text-fg text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer text-center">
            <Upload className="w-4 h-4 text-[#30d158]" />
            <span>JSONファイルを読み込む</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </section>

      {/* SECTION: MHTML / HTML EXTRACTOR & JSON GENERATOR */}
      <section className="mb-6 p-5 rounded-2xl apple-card border border-accent/30 bg-gradient-to-br from-accent/10 via-transparent to-transparent">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
            <FileCode className="w-4 h-4 text-accent" />
            <span>MHTML / HTML 履歴からJSON抽出 & 変換</span>
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
            MHTML対応
          </span>
        </div>

        <p className="text-xs text-muted mb-3 leading-relaxed">
          Google TakeoutでHTML形式で保存された履歴や、ブラウザの「名前を付けて保存（単一ファイル .mhtml）」から、アプリ専用の <code className="text-fg-soft">watch-history.json</code> を日時付きファイル名で自動生成・抽出します。
        </p>

        {/* MHTML Upload Box */}
        <label className="block w-full">
          <input
            type="file"
            accept=".mhtml,.mht,.html,.htm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processMhtmlFile(f);
            }}
            className="hidden"
            disabled={isProcessingMhtml}
          />
          <div className="w-full py-4 px-4 rounded-xl border border-dashed border-accent/30 hover:border-accent hover:bg-accent/5 active:scale-[0.99] transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center">
            <FileCode className="w-6 h-6 text-accent" />
            <span className="text-xs font-bold text-fg">
              {isProcessingMhtml ? 'MHTMLファイルを解析・抽出中...' : '.mhtml または .html ファイルを選択'}
            </span>
            <span className="text-[10px] text-muted">
              Quoted-PrintableデコードとYouTube視聴履歴ブロックを自動抽出
            </span>
          </div>
        </label>

        {/* Extraction Results & Actions */}
        {mhtmlResult && (
          <div className="mt-3 p-3.5 rounded-xl bg-white/[0.04] border border-accent/40 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#30d158] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                抽出完了
              </span>
              <span className="text-[10px] font-mono text-muted">
                {mhtmlResult.filename}
              </span>
            </div>

            <p className="text-xs text-fg/90">
              抽出履歴: <span className="font-bold text-fg">{mhtmlResult.totalExtracted.toLocaleString()}件</span>
              {mhtmlExtractedTracks.length > 0 && (
                <span>（音楽・ボカロ等: <span className="font-bold text-accent">{mhtmlExtractedTracks.length.toLocaleString()}曲</span>）</span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={handleDownloadMhtmlJson}
                className="py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-[#0a84ff]/20 active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSONを保存 (.json)</span>
              </button>

              <button
                type="button"
                onClick={handleImportMhtmlTracks}
                className="py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-accent/20 active:scale-95"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>ライブラリに取り込む</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: 2-STEP GOOGLE TAKEOUT ONBOARDING */}
      <section className="mb-6 p-5 rounded-2xl apple-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" />
            <span>Google Takeout（自分のYouTube全履歴を取り込む）</span>
          </h3>
        </div>

        <p className="text-xs text-muted mb-3 leading-relaxed">
          YouTube公式からエクスポートした <code className="text-fg-soft">watch-history.json</code> を読み込み、切り抜きや雑談を排除してあなた専用のApple Musicを作ります。
        </p>

        {/* 2-Step Frictionless Guide Card */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-fg/10 mb-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-accent text-on-accent text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </div>
            <div>
              <p className="text-xs font-bold text-fg">YouTube専用の直行リンクを開く</p>
              <p className="text-[11px] text-muted mt-0.5">
                あらかじめ「YouTube」のみが選択された状態で開くため迷いません。
              </p>
              <a
                href="https://takeout.google.com/settings/takeout/custom/youtube"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent font-bold mt-1.5 hover:underline"
              >
                <span>Google Takeout（YouTube専用）を開く</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="border-t border-fg/5 pt-2 flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-fg/20 text-fg text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </div>
            <div>
              <p className="text-xs font-bold text-fg">ダウンロードしたZIPをそのまま選択（展開は不要）</p>
              <p className="text-[11px] text-muted mt-0.5">
                下のボタンからZIPを選ぶと、中の視聴履歴を自動で見つけて取り込みます。
              </p>
            </div>
          </div>
        </div>

        {/* File Upload Trigger */}
        <label className="block w-full">
          <input
            type="file"
            accept=".zip,.json,.html,.mhtml,.csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isLoadingFile}
          />
          <div className="w-full py-5 px-4 rounded-xl border border-dashed border-fg/20 hover:border-accent hover:bg-white/[0.02] active:scale-[0.99] transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center">
            <FileText className="w-7 h-7 text-muted" />
            <span className="text-xs font-bold text-fg">
              {isLoadingFile ? '高精度フィルタリング解析中...' : 'Takeoutの ZIP（または watch-history.json）を選んで取り込む'}
            </span>
            <span className="text-[10px] text-muted">
              ボカロ・歌ってみた・J-POPを自動分類します
            </span>
          </div>
        </label>

        {importResult && (
          <div className="mt-3 p-3 rounded-xl bg-[#30d158]/15 border border-[#30d158]/30 text-[#30d158] text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{importResult}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-accent/15 border border-accent/30 text-accent text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* SECTION 4: ONE-TAP DEMO DATA */}
      <section className="mb-6 p-5 rounded-2xl apple-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-fg tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#ffd60a]" />
            <span>サンプル体験データを読み込む</span>
          </h3>
          <span className="text-[10px] text-muted">お試し用</span>
        </div>

        <p className="text-xs text-muted mb-4 leading-relaxed">
          YOASOBI、ボカロ神曲（バルーン、DECO*27、蝶々P、ピノキオピー等）を含む代表曲サンプルをワンタップでロードできます。
        </p>

        <button
          onClick={handleLoadDemo}
          className="w-full py-3 px-4 rounded-xl bg-fg/10 hover:bg-fg/20 active:scale-98 text-fg font-semibold text-xs flex items-center justify-center gap-2 transition-all"
        >
          {demoLoadedSuccess ? (
            <>
              <Check className="w-4 h-4 text-[#30d158]" />
              <span>体験データを反映しました！</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[#ffd60a]" />
              <span>体験データをロードする</span>
            </>
          )}
        </button>
      </section>

      {/* SECTION 5: QUICK URL ADD */}
      <section className="mb-6 p-5 rounded-2xl apple-card">
        <h3 className="text-sm font-bold text-fg tracking-tight mb-1 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent" />
          <span>YouTubeのURLから曲を即時追加</span>
        </h3>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          お気に入りの曲の動画URLを貼るだけで、ボカロPやカバー名義も自動抽出して登録されます。
        </p>

        <form onSubmit={handleQuickAdd} className="flex gap-2">
          <input
            type="text"
            placeholder="https://youtu.be/... または watch?v=..."
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-surface-2 text-xs text-fg placeholder-[#8e8e93] focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-accent text-on-accent text-xs font-semibold hover:bg-accent-hover active:scale-95 transition-all shrink-0"
          >
            {quickAddSuccess ? '追加済' : '追加'}
          </button>
        </form>
      </section>

      {/* SECTION 6: BACKUP & RESET */}
      <section className="p-5 rounded-2xl apple-card">
        <h3 className="text-sm font-bold text-fg tracking-tight mb-3">
          バックアップとデータ初期化
        </h3>

        <div className="flex flex-col gap-2.5">
          <a
            href="/melotrace-github.zip"
            download="melotrace-github.zip"
            className="w-full py-2.5 px-4 rounded-xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-fg text-xs font-medium flex items-center justify-center gap-2 transition-all text-center"
          >
            <Download className="w-3.5 h-3.5 text-[#30d158]" />
            <span>GitHub公開用プロジェクト一式をダウンロード (.zip)</span>
          </a>

          {/* GitHub Pages Deploy Guide & .github folder explanation */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-fg/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-accent" />
                GitHub Pages 公開手順（.github 対策）
              </span>
              <button
                type="button"
                onClick={() => setShowGithubGuide(!showGithubGuide)}
                className="text-[11px] text-accent hover:underline"
              >
                {showGithubGuide ? '閉じる' : '手順を見る'}
              </button>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              ブラウザの仕様により、ファイルをドラッグ＆ドロップすると「<span className="text-fg font-mono">.github</span>」フォルダが自動で除外されます。そのため以下の手順でデプロイ設定を追加してください。
            </p>

            <button
              type="button"
              onClick={handleCopyWorkflow}
              className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                copiedWorkflow
                  ? 'bg-[#30d158] text-black shadow-lg shadow-[#30d158]/20'
                  : 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/40'
              }`}
            >
              {copiedWorkflow ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>deploy.yml の内容をコピーしました！</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>GitHub Actions 設定 (deploy.yml) をコピー</span>
                </>
              )}
            </button>

            {showGithubGuide && (
              <ol className="list-decimal list-inside text-[11px] text-muted leading-relaxed flex flex-col gap-1.5 pt-1 border-t border-fg/5">
                <li>
                  ダウンロードしたZIPを解凍し、GitHubのリポジトリへドラッグ＆ドロップしてCommitします。
                </li>
                <li>
                  GitHubリポジトリ画面で「<b className="text-fg">Add file</b>」→「<b className="text-fg">Create new file</b>」をクリックします。
                </li>
                <li>
                  ファイル名欄に「<span className="text-fg font-mono bg-fg/10 px-1 py-0.5 rounded">.github/workflows/deploy.yml</span>」と入力します（スラッシュを入力すると自動でフォルダになります）。
                </li>
                <li>
                  上の「deploy.ymlをコピー」ボタンでコピーした内容をそのまま貼り付け、下の「<b className="text-fg">Commit changes</b>」をクリックします。
                </li>
                <li>
                  リポジトリの「<b className="text-fg">Settings</b>」タブ →「<b className="text-fg">Pages</b>」を開き、<b className="text-fg">Source</b> を「<b className="text-[#30d158]">GitHub Actions</b>」に変更してください。数分で公開URLが発行されます！
                </li>
              </ol>
            )}
          </div>

          {/* Ad Mitigation & Best Listening Tip */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              YouTube広告の抑制対策について
            </span>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              MeloTraceでは<b>プライバシー保護モード（youtube-nocookie.com）</b>経由で再生を行い、追跡Cookieを排除して広告頻度を大幅に抑制しています。万一広告が流れた場合も自動検知して2倍速で再生し、終了時に曲の頭からスムーズに再開します。
            </p>
            <p className="text-[10px] text-fg/50 leading-relaxed">
              ※スマホやPCで完全な広告なし再生を行いたい場合は、<b>Braveブラウザ</b>での閲覧や、Safariで無料の広告ブロック拡張機能（AdGuard等）のご利用が最も快適です。
            </p>
          </div>

          <button
            onClick={handleExportJson}
            className="w-full py-2.5 px-4 rounded-xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-fg text-xs font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-muted" />
            <span>ライブラリをJSON形式で書き出す</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('すべての音楽データを消去して初期化しますか？この操作は取り消せません。')) {
                clearAllData();
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-accent/10 hover:bg-accent/20 active:scale-98 text-accent text-xs font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>全データをリセット（初期化）</span>
          </button>
        </div>
      </section>

      </div>

      {/* BANNED LIST MODAL */}
      {showBannedModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl apple-card p-5 shadow-2xl border border-fg/10 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-fg/10">
              <div>
                <h3 className="text-base font-bold text-fg">非表示 (Ban) リスト管理</h3>
                <p className="text-[11px] text-muted">
                  除外したアーティストや動画を解除・復元できます
                </p>
              </div>
              <button onClick={() => setShowBannedModal(false)} className="text-muted">
                <Check className="w-5 h-5 text-fg" />
              </button>
            </div>

            <div className="overflow-y-auto py-3 flex flex-col gap-3 flex-1 ios-scroll-container">
              {bannedArtists.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-accent mb-1.5 uppercase tracking-wider">
                    除外アーティスト ({bannedArtists.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {bannedArtists.map((artist) => (
                      <div
                        key={artist}
                        className="flex items-center justify-between p-2 rounded-xl bg-fg/5 text-xs text-fg"
                      >
                        <span className="truncate pr-2">{artist}</span>
                        <button
                          onClick={() => unbanArtist(artist)}
                          className="text-[11px] text-[#30d158] font-bold shrink-0 hover:underline"
                        >
                          解除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bannedTracks.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-accent mb-1.5 uppercase tracking-wider">
                    除外動画ID ({bannedTracks.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {bannedTracks.map((id) => (
                      <div
                        key={id}
                        className="flex items-center justify-between p-2 rounded-xl bg-fg/5 text-xs text-fg"
                      >
                        <span className="truncate pr-2 font-mono">{id}</span>
                        <button
                          onClick={() => unbanTrack(id)}
                          className="text-[11px] text-[#30d158] font-bold shrink-0 hover:underline"
                        >
                          解除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bannedArtists.length === 0 && bannedTracks.length === 0 && (
                <div className="text-center py-8 text-xs text-muted">
                  現在除外されているアーティストや動画はありません。
                </div>
              )}
            </div>

            {bannedArtists.length + bannedTracks.length > 0 && (
              <div className="pt-3 border-t border-fg/10">
                <button
                  onClick={() => {
                    if (window.confirm('すべての除外設定を解除しますか？')) {
                      clearAllBans();
                    }
                  }}
                  className="w-full py-2 rounded-xl bg-fg/10 text-xs font-semibold text-fg hover:bg-fg/15"
                >
                  すべての除外を解除
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
