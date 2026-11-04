// デプロイ後に古い画面（index/JS）が残っていると、消えた旧チャンクの動的importが失敗する
// （「Importing a module script failed」）。その場合だけ、1回だけ自動で読み込み直す。
// 追加のAPI呼び出しなし。無限リロード防止に sessionStorage で60秒の間隔を空ける。
const KEY = 'melotrace_chunk_reload_at';

export function initChunkReload() {
  window.addEventListener('vite:preloadError', (e) => {
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // sessionStorage が使えなくても、止まるよりは1回読み込み直す
    }
    e.preventDefault();
    window.location.reload();
  });
}
