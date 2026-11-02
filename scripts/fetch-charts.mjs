// YouTube Data API v3 の「人気の動画（音楽カテゴリ・日本）」を取得し、public/data/charts.json を書き出す。
// - 実行: node scripts/fetch-charts.mjs（Actions から。環境変数 YOUTUBE_API_KEY が必要）
// - 失敗時は charts.json を書かず（既存があれば削除して）終了コード0で終わる → アプリ側は棚を非表示にする。
// - 公式埋め込みで再生できる曲だけを残す（status.embeddable / 公開 / 日本で視聴可）。
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = 'public/data/charts.json';
const REGION = 'JP';
const CATEGORY_MUSIC = '10';
const MAX_KEEP = 20;
const MAX_SECONDS = 20 * 60;

const key = process.env.YOUTUBE_API_KEY;

async function giveUp(reason) {
  console.warn(`[charts] 取得できませんでした: ${reason}（棚は非表示になります）`);
  await rm(OUT, { force: true });
  process.exit(0);
}

function isoToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

function playableInJapan(v) {
  const rr = v.contentDetails?.regionRestriction;
  if (!rr) return true;
  if (Array.isArray(rr.blocked) && rr.blocked.includes(REGION)) return false;
  if (Array.isArray(rr.allowed) && !rr.allowed.includes(REGION)) return false;
  return true;
}

if (!key) await giveUp('YOUTUBE_API_KEY が未設定');

const params = new URLSearchParams({
  part: 'snippet,contentDetails,status',
  chart: 'mostPopular',
  regionCode: REGION,
  videoCategoryId: CATEGORY_MUSIC,
  maxResults: '50',
  key,
});

let body;
try {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  body = await res.json();
  if (!res.ok) {
    // 例: 400 videoChartNotFound（チャート未提供）/ 403 quotaExceeded など
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.message || `HTTP ${res.status}`;
    await giveUp(`${res.status} ${reason}`);
  }
} catch (e) {
  await giveUp(e instanceof Error ? e.message : String(e));
}

const items = [];
for (const v of body.items || []) {
  const sn = v.snippet || {};
  const secs = isoToSeconds(v.contentDetails?.duration);
  if (!v.id || !sn.title) continue;
  if (sn.categoryId && sn.categoryId !== CATEGORY_MUSIC) continue;
  if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') continue;
  if (v.status?.embeddable !== true || v.status?.privacyStatus !== 'public') continue;
  if (!playableInJapan(v)) continue;
  if (secs != null && secs > MAX_SECONDS) continue;
  items.push({
    id: v.id,
    title: sn.title,
    artist: String(sn.channelTitle || '').replace(/\s-\sTopic$/i, ''),
    channelId: sn.channelId || undefined,
    duration: secs,
  });
  if (items.length >= MAX_KEEP) break;
}

if (items.length < 3) await giveUp(`再生できる曲が ${items.length} 件しかありません`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ version: 1, region: REGION, generatedAt: new Date().toISOString(), items }, null, 2) + '\n'
);
console.log(`[charts] ${items.length} 曲を ${OUT} に書き出しました`);
