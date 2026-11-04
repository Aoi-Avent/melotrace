/**
 * Mobile Background Playback & MediaSession Keep-Alive
 *
 * iOS Safari suspends YouTube iframes when the screen is locked or browser is minimized.
 * This service plays an inaudible background audio loop to keep the mobile audio session
 * active, while syncing with navigator.mediaSession so lock-screen controls, Control Center,
 * and Apple Watch play/pause/skip buttons work seamlessly.
 */

import { MusicTrack } from '../types/music';

const KEEPALIVE_KEY = 'melotrace_keepalive_v1';

/** 一時停止後も無音ループを残す時間（ms）。経過後にループを止める。既定30分 */
export const PAUSED_KEEPALIVE_MS = 30 * 60 * 1000;

/** 実際に無音サンプルを含む 1 秒の WAV（8bit/8kHz/モノラル）を生成する */
function createSilentWavUrl(): string {
  const sampleRate = 8000;
  const samples = sampleRate; // 1 sec
  const buffer = new ArrayBuffer(44 + samples);
  const v = new DataView(buffer);
  const w = (o: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8bit unsigned: 128 = silence
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

class AudioKeepAliveService {
  private silentAudio: HTMLAudioElement | null = null;
  private artUrl: string | null = null;
  private pausedAt: number | null = null; // 一時停止した時刻(ms)。猶予中のみ非null
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private visListenerAttached = false;

  private clearGrace() {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.pausedAt = null;
  }

  /** 経過時間で判定し、猶予切れならループを止める。未切れなら残り時間でタイマーを張り直す */
  private checkGrace() {
    if (this.pausedAt === null) return;
    const elapsed = Date.now() - this.pausedAt;
    if (elapsed >= PAUSED_KEEPALIVE_MS) {
      this.clearGrace();
      this.stopLoop();
      return;
    }
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => this.checkGrace(), PAUSED_KEEPALIVE_MS - elapsed);
  }

  private attachVisibilityListener() {
    if (this.visListenerAttached || typeof document === 'undefined') return;
    this.visListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.checkGrace();
    });
  }

  /** 調査用ログ向けの状態 */
  public getState(): { enabled: boolean; loopPlaying: boolean; pausedElapsedSec: number | null } {
    return {
      enabled: this.isEnabled(),
      loopPlaying: !!this.silentAudio && !this.silentAudio.paused,
      pausedElapsedSec: this.pausedAt === null ? null : Math.round((Date.now() - this.pausedAt) / 1000),
    };
  }

  /** アルバムジャケットがあれば、ロック画面などの画像に使う */
  public setArtwork(url: string | null) {
    this.artUrl = url;
  }

  /** 無音ループによるバックグラウンド維持が有効か（既定: 有効） */
  public isEnabled(): boolean {
    try {
      return localStorage.getItem(KEEPALIVE_KEY) !== 'off';
    } catch (e) {
      return true;
    }
  }

  public setEnabled(on: boolean) {
    try {
      localStorage.setItem(KEEPALIVE_KEY, on ? 'on' : 'off');
    } catch (e) {}
    if (!on) {
      this.clearGrace();
      this.stopLoop();
    }
  }

  private ensureAudio() {
    if (this.silentAudio || typeof window === 'undefined') return;
    try {
      const a = new Audio(createSilentWavUrl());
      a.loop = true;
      a.setAttribute('playsinline', 'true');
      a.setAttribute('webkit-playsinline', 'true');
      this.silentAudio = a;
    } catch (e) {}
  }

  /** 曲が実際に再生され始めてから呼ぶ（再生開始前に別の音声を鳴らして競合させない） */
  public startLoop() {
    if (!this.isEnabled()) return;
    this.clearGrace();
    this.ensureAudio();
    if (this.silentAudio && this.silentAudio.paused) {
      try {
        const p = this.silentAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
  }

  public stopLoop() {
    if (this.silentAudio && !this.silentAudio.paused) {
      try {
        this.silentAudio.pause();
      } catch (e) {}
    }
  }

  /** メタデータ（ロック画面・コントロールセンター表示）のみ更新する */
  public onPlay(track: MusicTrack | null) {
    this.clearGrace(); // 再生再開・曲の変更で猶予を解除
    if (track && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: 'MeloTrace',
          artwork: [
            ...(this.artUrl ? [{ src: this.artUrl, sizes: '600x600', type: 'image/jpeg' }] : []),
            { src: `https://img.youtube.com/vi/${track.id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
            { src: `https://img.youtube.com/vi/${track.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          ],
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) {}
    }
  }

  /**
   * 一時停止。通常はループを PAUSED_KEEPALIVE_MS だけ残す（iOSにWebViewを凍結させないため）。
   * immediate: true（スリープタイマー・明示的な停止）なら即座に止める。
   */
  public onPause(opts?: { immediate?: boolean }) {
    this.clearGrace();
    if (opts?.immediate || !this.isEnabled()) {
      this.stopLoop();
    } else {
      this.attachVisibilityListener();
      this.pausedAt = Date.now();
      this.graceTimer = setTimeout(() => this.checkGrace(), PAUSED_KEEPALIVE_MS);
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch (e) {}
    }
  }

  public updatePositionState(currentSec: number, durationSec: number) {
    if (
      typeof window === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession.setPositionState
    ) {
      return;
    }
    if (!durationSec || isNaN(durationSec) || durationSec <= 0) return;
    try {
      const pos = Math.min(Math.max(0, currentSec), durationSec);
      navigator.mediaSession.setPositionState({
        duration: durationSec,
        playbackRate: 1.0,
        position: pos,
      });
    } catch (e) {}
  }

  public setupMediaSessionHandlers(handlers: {
    onPlay: () => void;
    onPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSeek: (sec: number) => void;
  }) {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.startLoop(); // 先にループを同期的に再開してから再生を再開する
        handlers.onPlay();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        handlers.onPause();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        handlers.onPrev();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handlers.onNext();
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          handlers.onSeek(details.seekTime);
        }
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        handlers.onSeek(Math.max(0, (details.seekTime || 0) - offset));
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        handlers.onSeek((details.seekTime || 0) + offset);
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        handlers.onPause();
      });
    } catch (e) {
      console.warn('Failed to register mediaSession actions', e);
    }
  }
}

export const audioKeepAlive = new AudioKeepAliveService();
