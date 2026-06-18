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

export default function CharacterNotification({ news, onOpenNews }: Props) {
  const [settings, setSettings] = useState<CharacterSettings>(
    DEFAULT_CHARACTER_SETTINGS
  );
  // 表示期間（newsNoticeDays日）以内の有効な新着。クライアントでのみ算出する。
  const [windowNews, setWindowNews] = useState<NewsItem[]>([]);

  // 設定を読み込み
  useEffect(() => {
    loadCharacterSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  // 時間ウィンドウ判定：投稿から newsNoticeDays 日以内の新着を抽出。
  // 「未読」「1日1回」などの抑制は行わず、期間内なら表示のたびに毎回再生する。
  useEffect(() => {
    const days =
      settings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inWindow = news.filter((n) => {
      const t = new Date(n.createdAt).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
    setWindowNews(inWindow);
  }, [news, settings.newsNoticeDays]);

  const show = settings.enabled && windowNews.length > 0;
  const latest = windowNews[0];

  if (!show || !latest) return null;

  const handleClick = () => {
    onOpenNews(latest);
  };

  return (
    <div
      className="fixed top-14 left-0 right-0 z-[200] pointer-events-none overflow-hidden"
      style={{ height: settings.size + 120 }}
      aria-hidden={false}
    >
      {/* キャラクター（画面上方を横切る／クリックでモーダル） */}
      <div
        className="absolute pointer-events-auto cursor-pointer"
        onClick={handleClick}
        role="button"
        title={latest.title ? `新着：${latest.title}` : "新着情報があります"}
        style={{
          animation: `walkAcross ${settings.speed}s linear infinite`,
          top: 72,
        }}
      >
        <div className="relative">
          {/* 吹き出し（キャラの上・上下左右パディングで文字切れ防止） */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap">
            <div className="bg-teal-600 text-white text-xs leading-none py-2 px-4 rounded-full shadow-lg animate-bounce">
              📢 新着情報があります！
            </div>
            <div className="w-2 h-2 bg-teal-600 rotate-45 mx-auto -mt-1" />
          </div>

          {/* キャラクター本体 */}
          {settings.characterStyle === "emoji" ? (
            <div
              style={{ fontSize: settings.size, lineHeight: 1 }}
              className="select-none"
            >
              {settings.emoji}
            </div>
          ) : (
            <CharacterSVG type={settings.svgType} size={settings.size} />
          )}
        </div>
      </div>
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
