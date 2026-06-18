"use client";

import { useEffect, useState } from "react";
import { loadCharacterSettings } from "@/lib/portal-store";
import {
  DEFAULT_CHARACTER_SETTINGS,
  type CharacterSettings,
  type CharacterSvgType,
} from "@/types/portal";

type Props = {
  hasUnreadNews: boolean;
  latestNewsTitle?: string;
  onCharacterClick: () => void;
};

export default function CharacterNotification({
  hasUnreadNews,
  latestNewsTitle,
  onCharacterClick,
}: Props) {
  const [settings, setSettings] = useState<CharacterSettings>(
    DEFAULT_CHARACTER_SETTINGS
  );
  const [show, setShow] = useState(false);

  // 設定を読み込み
  useEffect(() => {
    loadCharacterSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  // 表示判定（未読があり、今日まだ見ていない場合のみ表示）
  useEffect(() => {
    if (!hasUnreadNews || !settings.enabled) {
      setShow(false);
      return;
    }
    if (typeof window === "undefined") return;
    const today = new Date().toISOString().slice(0, 10);
    const lastSeen = localStorage.getItem("news_character_seen");
    setShow(lastSeen !== today);
  }, [hasUnreadNews, settings.enabled]);

  const handleClick = () => {
    if (typeof window !== "undefined") {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem("news_character_seen", today);
    }
    setShow(false);
    onCharacterClick();
  };

  if (!show) return null;

  return (
    <div
      className="fixed top-16 left-0 right-0 z-40 pointer-events-none overflow-hidden"
      style={{ height: settings.size + 56 }}
      aria-hidden={false}
    >
      {/* キャラクター（画面上方を横切る） */}
      <div
        className="absolute pointer-events-auto cursor-pointer"
        onClick={handleClick}
        title={latestNewsTitle ? `新着：${latestNewsTitle}` : "新着情報があります"}
        style={{
          animation: `walkAcross ${settings.speed}s linear infinite`,
          top: 34,
        }}
      >
        <div className="relative">
          {/* 吹き出し */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap">
            <div className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg animate-bounce">
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
