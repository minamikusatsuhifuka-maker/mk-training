"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadCharacterSettings } from "@/lib/portal-store";
import {
  DEFAULT_CHARACTER_SETTINGS,
  isNewsExpired,
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

// 複数新着時のイラストプール（style=svgのとき使用）。全イラストを順番に循環で割り当てる。
const SVG_POOL: CharacterSvgType[] = [
  "cat",
  "dog",
  "rabbit",
  "bird",
  "chihuahua",
  "sakura",
  "sprout",
  "star",
  "moon",
];

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
  // 設定（横切り速度D・有効/無効）を読み込み終えたか。
  // 既定値でアニメを開始してから実設定に差し替わると、その差し替えで
  // アニメ effect が再実行され横切りが途中で止まる。これを防ぐため、
  // 設定が確定するまでは再生を開始しない。
  const [settingsReady, setSettingsReady] = useState(false);
  // 表示期間（newsNoticeDays日）以内の有効な新着。クライアントでのみ算出する。
  const [targetNews, setTargetNews] = useState<NewsItem[]>([]);
  // 現在アニメ再生中（画面に出ている）キャラのインデックス集合。
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // 設定を読み込み
  useEffect(() => {
    loadCharacterSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setSettingsReady(true));
  }, []);

  // 通知期限判定：お知らせ毎の noticeUntil（日時）を優先。無ければ createdAt + newsNoticeDays日。
  // 「未読」「1日1回」などの抑制は行わず、期限内なら表示のたびに毎回再生する。
  useEffect(() => {
    const days =
      settings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
    const now = Date.now();
    const inWindow = news.filter((n) => !isNewsExpired(n, days, now));
    setTargetNews(inWindow);
  }, [news, settings.newsNoticeDays]);

  // 対象新着の「id集合（順序込み）」を安定文字列化。
  // targetNews は news 到着やタスク読み込み等の再レンダーで“中身が同じでも
  // 別参照”に作り直されるため、参照を依存に使うとアニメが毎回リセットされる。
  // id集合を署名化し、これが実際に変わった時だけ再生させる。
  const targetSignature = useMemo(
    () => targetNews.map((n) => n.id).join("|"),
    [targetNews]
  );

  // 再生トリガのキー：対象新着id集合＋有効フラグ＋横切り速度D。
  // これらが実際に変わった時だけアニメを再スケジュールする（無関係な再レンダーでは不変）。
  const playKey = useMemo(
    () => `${settings.enabled ? "on" : "off"}:${settings.speed}:${targetSignature}`,
    [settings.enabled, settings.speed, targetSignature]
  );

  // 同じ playKey を二重に再生しないためのガード（マウント中のみ有効）。
  // 無関係な再レンダーで setTimeout が clear／再開されないことを保証する。
  const playedKeyRef = useRef<string | null>(null);

  // 等間隔スケジューリング：targetNews を i*INTERVAL でずらして1巡だけ再生する。
  // 各キャラは開始時に表示、横切り時間D後に非表示。無限ループはしない。
  // 再マウント（別ページから戻る等）のたびに走るため「期間内は毎回再生」は維持される。
  useEffect(() => {
    // 設定確定前は開始しない（既定→実設定の切替でアニメが途中で止まるのを防ぐ）。
    if (!settingsReady) return;

    if (!settings.enabled || targetNews.length === 0) {
      setVisible(new Set());
      playedKeyRef.current = null;
      return;
    }

    // 同じ対象新着集合を再生済みなら、無関係な再レンダーでは何もしない。
    // ここで return することでタイマーを clear せず、横切りを最後まで見せる。
    if (playedKeyRef.current === playKey) return;
    playedKeyRef.current = playKey;

    setVisible(new Set());

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

    // アンマウント時、または対象新着id集合／速度が実際に変わった時だけ全タイマーをclear。
    // 毎レンダーでは clear しない（playKey が同一なら上で早期 return するため）。
    return () => timers.forEach(clearTimeout);
    // targetNews / settings.speed は playKey に内包済み。参照変化での再実行を避けるため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsReady, playKey]);

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
        // 表示キャラの解決:
        //  ① news.character（個別指定）があれば、それをイラストで表示（global style や
        //     SVG_POOL の自動割当より優先）。
        //  ② 無ければ従来ロジック：1件のみ＝既存のキャラ設定（絵文字/SVG）、複数件＝
        //     style=svgならイラストプール、それ以外は絵文字プールを循環で割り当てる。
        const useSvg = !!item.character || settings.characterStyle === "svg";
        const svgType = item.character
          ? item.character
          : isSingle
          ? settings.svgType
          : SVG_POOL[i % SVG_POOL.length];
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
                <CharacterSVG type={svgType} size={settings.size} />
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
    chihuahua: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M22 16 L17 54 L43 41 Z" fill="#2b2622" />
        <path d="M78 16 L83 54 L57 41 Z" fill="#2b2622" />
        <path d="M27 24 L24 47 L39 40 Z" fill="#b9793f" />
        <path d="M73 24 L76 47 L61 40 Z" fill="#b9793f" />
        <path
          d="M50 26 C30 26 24 42 24 57 C24 77 36 87 50 87 C64 87 76 77 76 57 C76 42 70 26 50 26 Z"
          fill="#2b2622"
        />
        <path
          d="M50 57 C37 57 31 65 31 73 C31 82 40 89 50 89 C60 89 69 82 69 73 C69 65 63 57 50 57 Z"
          fill="#c98a4b"
        />
        <ellipse cx="39" cy="46" rx="4.5" ry="3.4" fill="#b9793f" />
        <ellipse cx="61" cy="46" rx="4.5" ry="3.4" fill="#b9793f" />
        <circle cx="39" cy="53" r="4.2" fill="#15110d" />
        <circle cx="61" cy="53" r="4.2" fill="#15110d" />
        <circle cx="40.4" cy="51.6" r="1.2" fill="#fff" />
        <circle cx="62.4" cy="51.6" r="1.2" fill="#fff" />
        <ellipse cx="50" cy="69" rx="5" ry="3.6" fill="#15110d" />
        <path
          d="M50 72 L50 77 M50 77 C46 80 43 79 42 77 M50 77 C54 80 57 79 58 77"
          stroke="#6b4423"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
    sakura: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g fill="#f7a8c8">
          <path d="M50 48 C41 40 39 27 45 18 C46.5 21 48 22 50 22 C52 22 53.5 21 55 18 C61 27 59 40 50 48 Z" />
          <g transform="rotate(72 50 50)">
            <path d="M50 48 C41 40 39 27 45 18 C46.5 21 48 22 50 22 C52 22 53.5 21 55 18 C61 27 59 40 50 48 Z" />
          </g>
          <g transform="rotate(144 50 50)">
            <path d="M50 48 C41 40 39 27 45 18 C46.5 21 48 22 50 22 C52 22 53.5 21 55 18 C61 27 59 40 50 48 Z" />
          </g>
          <g transform="rotate(216 50 50)">
            <path d="M50 48 C41 40 39 27 45 18 C46.5 21 48 22 50 22 C52 22 53.5 21 55 18 C61 27 59 40 50 48 Z" />
          </g>
          <g transform="rotate(288 50 50)">
            <path d="M50 48 C41 40 39 27 45 18 C46.5 21 48 22 50 22 C52 22 53.5 21 55 18 C61 27 59 40 50 48 Z" />
          </g>
        </g>
        <circle cx="50" cy="50" r="7.5" fill="#fcd7e6" />
        <g stroke="#e0648f" strokeWidth="1.3" strokeLinecap="round">
          <line x1="50" y1="50" x2="50" y2="43" />
          <line x1="50" y1="50" x2="56.5" y2="46.5" />
          <line x1="50" y1="50" x2="56.5" y2="53.5" />
          <line x1="50" y1="50" x2="43.5" y2="53.5" />
          <line x1="50" y1="50" x2="43.5" y2="46.5" />
        </g>
        <g fill="#e0648f">
          <circle cx="50" cy="42" r="1.5" />
          <circle cx="57.5" cy="46" r="1.5" />
          <circle cx="57.5" cy="54" r="1.5" />
          <circle cx="42.5" cy="54" r="1.5" />
          <circle cx="42.5" cy="46" r="1.5" />
        </g>
      </svg>
    ),
    sprout: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M50 88 L50 54"
          stroke="#3f9b54"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M50 60 C36 60 26 52 24 39 C39 37 50 45 50 60 Z"
          fill="#5cc06f"
        />
        <path
          d="M50 54 C64 54 74 46 76 33 C61 31 50 39 50 54 Z"
          fill="#7ad28a"
        />
        <path
          d="M50 60 C42 56 35 50 28 42"
          stroke="#358a49"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M50 54 C58 50 65 44 72 35"
          stroke="#4cae62"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M30 88 C36 82 64 82 70 88 Z" fill="#c7a06d" />
      </svg>
    ),
    star: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M50 14 L61 39 L88 42 L67 60 L73 87 L50 73 L27 87 L33 60 L12 42 L39 39 Z"
          fill="#ffd24a"
        />
        <path
          d="M50 14 L61 39 L88 42 L67 60 L73 87 L50 73 Z"
          fill="#fbbf24"
        />
        <circle cx="43" cy="43" r="3.6" fill="#fff" opacity="0.55" />
      </svg>
    ),
    moon: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M70 16 C48 16 30 33 30 53 C30 73 48 90 70 90 C58 82 51 68 51 53 C51 38 58 24 70 16 Z"
          fill="#ffd45e"
        />
        <path
          d="M77 28 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 z"
          fill="#ffe08a"
        />
      </svg>
    ),
  };
  return svgs[type] ?? svgs.cat;
}
