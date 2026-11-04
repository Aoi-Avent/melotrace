/**
 * ビルドごとの識別子を作り、(1) コードへ埋め込み (2) dist/version.json として書き出す。
 * アプリ側（src/utils/appUpdate.ts）が version.json を見て「新しいデプロイがあるか」を判定する。
 * - GitHub Actions では GITHUB_SHA を使う（毎日の定期デプロイでコードが同じなら、識別子も同じ＝更新通知は出ない）
 * - ローカルでは時刻を使う
 */
import type { Plugin } from 'vite';

export function buildVersionPlugin(): Plugin {
  const id = (process.env.GITHUB_SHA || '').slice(0, 12) || String(Date.now());
  return {
    name: 'melotrace-build-version',
    config() {
      return { define: { __APP_BUILD_ID__: JSON.stringify(id) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) });
    },
  };
}
