/**
 * YouTube の URL（プレイリスト / チャンネル / 「◯◯ - Topic」チャンネル）を判定する。
 * 判定に失敗したときは、何が悪いかが分かる文言の UrlImportError を投げる。
 */

export type YtTarget =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'channelId'; channelId: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'username'; username: string };

export class UrlImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlImportError';
  }
}

const YT_HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

export function targetLabel(t: YtTarget): string {
  switch (t.kind) {
    case 'playlist':
      return `プレイリスト（${t.playlistId}）`;
    case 'channelId':
      return `チャンネル（${t.channelId}）`;
    case 'handle':
      return `チャンネル（${t.handle}）`;
    case 'username':
      return `チャンネル（旧ユーザー名 ${t.username}）`;
  }
}

/** チャンネルID（UC…）→ アップロード一覧プレイリストID（UU…）。API を呼ばずに作れる。 */
export function uploadsPlaylistIdOf(channelId: string): string {
  return 'UU' + channelId.slice(2);
}

export function parseYoutubeTarget(raw: string): YtTarget {
  const input = raw.trim();
  if (!input) throw new UrlImportError('URLが空です。プレイリストかチャンネルのURLを貼り付けてください。');

  // スキームなし（youtube.com/...）や @handle 単体も受け付ける
  let text = input;
  if (/^@[\w.\-]+$/.test(text)) text = `https://www.youtube.com/${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UrlImportError('URLの形式として読み取れませんでした。「https://www.youtube.com/…」の形で貼り付けてください。');
  }

  if (!YT_HOSTS.test(url.hostname)) {
    throw new UrlImportError(
      `YouTube以外のURLです（${url.hostname}）。youtube.com または music.youtube.com のURLを貼り付けてください。`,
    );
  }

  const list = url.searchParams.get('list') || '';
  const segs = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const first = segs[0] || '';

  // プレイリスト（/playlist?list=… と /watch?v=…&list=…）
  if (list) {
    if (/^RD/.test(list) && !/^RDCLAK5uy/.test(list)) {
      throw new UrlImportError('このURLは YouTube が自動生成する「ミックス」（list=RD…）です。曲の一覧を取得できないため、通常のプレイリストのURLを使ってください。');
    }
    if (list === 'WL' || list === 'LL' || list === 'LM') {
      throw new UrlImportError('「後で見る」「高く評価した動画」は本人専用の一覧のため、APIキーでは取得できません。公開プレイリストにコピーしてからそのURLを使ってください。');
    }
    if (CHANNEL_ID_RE.test(list)) {
      throw new UrlImportError(`list= にチャンネルID（${list}）が入っています。プレイリストのIDは「PL…」「OLAK5uy…」などで始まります。`);
    }
    if (!/^[\w-]{10,}$/.test(list)) {
      throw new UrlImportError(`プレイリストIDとして読み取れませんでした（list=${list}）。URLが途中で切れていないか確認してください。`);
    }
    return { kind: 'playlist', playlistId: list };
  }

  if (first === 'playlist') {
    throw new UrlImportError('プレイリストのURLに「list=」がありません。URLが途中で切れていないか確認してください。');
  }

  // チャンネル
  if (first === 'channel' || (first === 'browse' && segs[1]?.startsWith('UC'))) {
    const id = segs[1] || '';
    if (!CHANNEL_ID_RE.test(id)) {
      throw new UrlImportError(`チャンネルIDとして読み取れませんでした（${id || '空'}）。チャンネルIDは「UC」で始まる24文字です。`);
    }
    return { kind: 'channelId', channelId: id };
  }
  if (first.startsWith('@')) {
    const handle = first;
    if (handle.length < 2) throw new UrlImportError('@ハンドルが空です。「@名前」の形のURLを貼り付けてください。');
    return { kind: 'handle', handle };
  }
  if (first === 'user' && segs[1]) return { kind: 'username', username: segs[1] };
  if (first === 'c' && segs[1]) {
    // 旧カスタムURLは API で引けないことが多いので、ハンドルとして試す
    return { kind: 'handle', handle: `@${segs[1]}` };
  }

  // 取り込み対象外のURLを具体的に案内する
  if (first === 'watch' || url.hostname === 'youtu.be' || first === 'shorts') {
    throw new UrlImportError('動画1本のURLです（プレイリスト指定の list= がありません）。1曲だけなら上の「URLで曲を追加」を使ってください。');
  }
  if (first === 'browse') {
    throw new UrlImportError('YouTube Music のアルバム／ブラウズ用URLは判定できません。アルバムはプレイリストのURL（list=OLAK5uy…）を使ってください。');
  }
  if (first === 'results' || first === 'search') {
    throw new UrlImportError('検索結果のURLです。プレイリストかチャンネルのページを開いて、そのURLを貼り付けてください。');
  }
  if (!first) {
    throw new UrlImportError('YouTubeのトップページのURLです。プレイリストかチャンネルのページのURLを貼り付けてください。');
  }
  throw new UrlImportError(`プレイリストでもチャンネルでもないURLです（/${first}…）。対応しているのは、プレイリスト、/channel/UC…、/@ハンドル、/user/名前 の形式です。`);
}
