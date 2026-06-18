"use client";

import { useEffect, useState } from "react";
import { loadCharacterSettings } from "@/lib/portal-store";
import {
  DEFAULT_CHARACTER_SETTINGS,
  type CharacterSettings,
  type CharacterSvgType,
  type NewsItem,
} from "@/types/portal";

type Props = {
  /** 有効・新しい順の新着情報（page.tsxで整形済み） */
  news: NewsItem[];
  /** アニメ（キャラ／吹き出し）クリック時に開くお知らせ */
  onOpenNews: (item: NewsItem) => void;
};

// 複数新着時のキャラクタープール（重複しない絵文字）。
// character_settings に専用のプール設定が無いためフォールバックとして定義。
const CHARACTER_POOL = [
  "🐶",
  "🐱",
  "🐰",
  "🐻",
  "🦊",
  "🐼",
  "🐹",
  "🐯",
  "🐨",
  "🐮",
] as const;

// オーバーラップ再生の係数。INTERVAL = 横切り時間D × この値。
// D未満にすることで「前のキャラが抜けきる前に次が登場」＝複数が並走する。
// 小さいほど密に並走（重なりやすい）。調整可能。
const OVERLAP_RATIO = 0.4;
// スケジュール間隔の下限(ms)。Dが極端に小さい時に間隔が詰まりすぎないように。
const MIN_INTERVAL_MS = 300;

export default function CharacterNotification({ news, onOpenNews }: Props) {
  const [settings, setSettings] = useState<CharacterSettings>(
    DEFAULT_CHARACTER_SETTINGS
  );
  // 表示期間（newsNoticeDays日）以内の有効な新着。クライアントでのみ算出する。
  const [targetNews, setTargetNews] = useState<NewsItem[]>([]);
  // 現在アニメ再生中（画面に出ている）キャラのインデックス集合。
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // 設定を読み込み
  useEffect(() => {
    loadCharacterSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  // 時間ウィンドウ判定：投稿から newsNoticeDays 日以内の新着を createdAt 降順で抽出。
  // 「未読」「1日1回」などの抑制は行わず、期間内なら表示のたびに毎回再生する。
  useEffect(() => {
    const days =
      settings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inWindow = news.filter((n) => {
      const t = new Date(n.createdAt).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
    setTargetNews(inWindow);
  }, [news, settings.newsNoticeDays]);

  // 等間隔スケジューリング：targetNews を i*INTERVAL でずらして1巡だけ再生する。
  // 各キャラは開始時に表示、横切り時間D後に非表示。無限ループはしない。
  // マウント/データ到着のたびに走るため「期間内は毎回再生」は維持される。
  useEffect(() => {
    setVisible(new Set());
    if (!settings.enabled || targetNews.length === 0) return;

    const dMs = settings.speed * 1000; // 1体の横切り時間
    // オーバーラップ再生：INTERVAL < D にして前のキャラが抜ける前に次を登場させる
    const intervalMs = Math.max(MIN_INTERVAL_MS, Math.round(dMs * OVERLAP_RATIO));
    const timers: ReturnType<typeof setTimeout>[] = [];

    targetNews.forEach((_, i) => {
      const startAt = i * intervalMs;
      // 開始：このキャラを表示
      timers.push(
        setTimeout(() => {
          setVisible((prev) => new Set(prev).add(i));
        }, startAt)
      );
      // 終了：横切り完了後に非表示（1巡で終わる）
      timers.push(
        setTimeout(() => {
          setVisible((prev) => {
            const next = new Set(prev);
            next.delete(i);
            return next;
          });
        }, startAt + dMs)
      );
    });

    // アンマウント/再スケジュール時に全タイマーをclear
    return () => timers.forEach(clearTimeout);
  }, [targetNews, settings.enabled, settings.speed]);

  if (!settings.enabled || targetNews.length === 0) return null;

  const isSingle = targetNews.length === 1;

  return (
    <div
      className="fixed top-14 left-0 right-0 z-[200] pointer-events-none overflow-hidden"
      style={{ height: settings.size + 120 }}
      aria-hidden={false}
    >
      {targetNews.map((item, i) => {
        if (!visible.has(i)) return null;
        // 1件のみ：既存のキャラ設定（絵文字/SVG）を優先。
        // 複数件：プールから重複しない絵文字を割り当て（i % プール長で循環）。
        const useSvg = isSingle && settings.characterStyle === "svg";
        const emojiChar = isSingle
          ? settings.emoji
          : CHARACTER_POOL[i % CHARACTER_POOL.length];

        return (
          <div
            key={item.id}
            className="absolute pointer-events-auto cursor-pointer"
            onClick={() => onOpenNews(item)}
            role="button"
            title={item.title ? `新着：${item.title}` : "新着情報があります"}
            style={{
              // 1巡のみ（infiniteにしない）。横切り後はforwardsで画面外に留める。
              animation: `walkAcross ${settings.speed}s linear forwards`,
              // 並走時に吹き出し同士が完全重なりしないよう軽い縦オフセット（3段で循環）。
              top: 72 + (i % 3) * 12,
            }}
          >
            <div className="relative">
              {/* 吹き出し（キャラの上・新着タイトルを表示／文字切れ防止のパディング） */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full">
                <div className="bg-teal-600 text-white text-xs leading-none py-2 px-4 rounded-full shadow-lg animate-bounce flex items-center gap-1 max-w-[220px]">
                  <span className="shrink-0">📢</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.title}
                  </span>
                </div>
                <div className="w-2 h-2 bg-teal-600 rotate-45 mx-auto -mt-1" />
              </div>

              {/* キャラクター本体 */}
              {useSvg ? (
                <CharacterSVG type={settings.svgType} size={settings.size} />
              ) : (
                <div
                  style={{ fontSize: settings.size, lineHeight: 1 }}
                  className="select-none"
                >
                  {emojiChar}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SVGキャラクター ───
export function CharacterSVG({
  type,
  size,
}: {
  type: CharacterSvgType;
  size: number;
}) {
  const svgs: Record<CharacterSvgType, React.ReactElement> = {
    cat: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="60" rx="28" ry="25" fill="#F0997B" />
        <path d="M30 40 L25 20 L40 35 Z" fill="#F0997B" />
        <path d="M70 40 L75 20 L60 35 Z" fill="#F0997B" />
        <circle cx="40" cy="55" r="4" fill="#333" />
        <circle cx="60" cy="55" r="4" fill="#333" />
        <path
          d="M45 65 Q50 70 55 65"
          stroke="#333"
          strokeWidth="2"
          fill="none"
        />
        <path d="M48 62 L52 62" stroke="#333" strokeWidth="2" />
      </svg>
    ),
    dog: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="58" rx="28" ry="26" fill="#BA7517" />
        <ellipse cx="28" cy="45" rx="10" ry="18" fill="#854F0B" />
        <ellipse cx="72" cy="45" rx="10" ry="18" fill="#854F0B" />
        <circle cx="40" cy="55" r="4" fill="#333" />
        <circle cx="60" cy="55" r="4" fill="#333" />
        <ellipse cx="50" cy="65" rx="5" ry="4" fill="#333" />
        <path d="M50 69 L50 74" stroke="#333" strokeWidth="2" />
      </svg>
    ),
    rabbit: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="62" rx="26" ry="24" fill="#F4C0D1" />
        <ellipse cx="40" cy="30" rx="7" ry="22" fill="#F4C0D1" />
        <ellipse cx="60" cy="30" rx="7" ry="22" fill="#F4C0D1" />
        <ellipse cx="40" cy="30" rx="3" ry="16" fill="#ED93B1" />
        <ellipse cx="60" cy="30" rx="3" ry="16" fill="#ED93B1" />
        <circle cx="42" cy="58" r="4" fill="#333" />
        <circle cx="58" cy="58" r="4" fill="#333" />
        <ellipse cx="50" cy="66" rx="4" ry="3" fill="#D4537E" />
      </svg>
    ),
    bird: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="58" rx="25" ry="22" fill="#85B7EB" />
        <circle cx="50" cy="35" r="16" fill="#85B7EB" />
        <circle cx="45" cy="32" r="3" fill="#333" />
        <circle cx="55" cy="32" r="3" fill="#333" />
        <path d="M48 38 L52 38 L50 42 Z" fill="#EF9F27" />
        <path d="M25 60 Q15 55 20 68" fill="#378ADD" />
        <path d="M75 60 Q85 55 80 68" fill="#378ADD" />
      </svg>
    ),
  };
  return svgs[type] ?? svgs.cat;
}
