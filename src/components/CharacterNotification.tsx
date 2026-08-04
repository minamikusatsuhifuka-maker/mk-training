"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadCharacterSettings } from "@/lib/portal-store";
import {
  DEFAULT_CHARACTER_SETTINGS,
  isNewsExpired,
  URGENCY_META,
  urgencyOf,
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
// 133-A: かわいい系6種（🐥🐷🦦🦭🦝🦉）を「おまかせ」対象に追加。
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
  "🐥",
  "🐷",
  "🦦",
  "🦭",
  "🦝",
  "🦉",
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
  "shiba",
  "panda",
  "penguin",
  "hedgehog",
  "rainbow",
  "note",
  "clover",
  "butterfly",
  // 133-B: オリジナル6体も「おまかせ」循環に含める
  "mochi",
  "happa",
  "kumopi",
  "piyomaru",
  "kogumaro",
  "azaran",
];

// ─── 133-C: キャラ固有モーション（相性で自動決定・投稿者の操作なし） ───
// 対応表に無いキャラは従来の横切りのまま。横移動(walkAcross)と固有の動き(内側ラッパー)は分離。
type CharMotion =
  | "swim" // 波の上をすいすい（装飾: 波）
  | "float" // ふわふわ漂う
  | "flutter" // ぱたぱた小刻み飛行
  | "hop" // ぴょんぴょんホップ
  | "balloon" // 風船でふわり（装飾: 風船）
  | "rainbowSlide" // 虹の上をゆるやかに（装飾: 虹）
  | "roll"; // ころころ転がる

const MOTION_ANIMATION: Record<CharMotion, string> = {
  swim: "charMotionSwim 1.6s ease-in-out infinite",
  float: "charMotionFloat 2.4s ease-in-out infinite",
  flutter: "charMotionFlutter 0.5s ease-in-out infinite",
  hop: "charMotionHop 1.2s ease-in-out infinite",
  balloon: "charMotionBalloon 2.2s ease-in-out infinite",
  rainbowSlide: "charMotionFloat 2.8s ease-in-out infinite",
  roll: "charMotionRoll 1.6s linear infinite",
};

const SVG_MOTIONS: Partial<Record<CharacterSvgType, CharMotion>> = {
  azaran: "swim", // あざらん=波の上をすいすい
  kumopi: "float",
  piyomaru: "flutter",
  mochi: "hop",
  rabbit: "hop",
  kogumaro: "balloon",
  rainbow: "rainbowSlide",
  butterfly: "flutter",
};

const EMOJI_MOTIONS: Record<string, CharMotion> = {
  "🦦": "swim", // ラッコ（院長要望・全体像が見える波乗り）
  "🦭": "swim",
  "🐥": "flutter",
  "🐦": "flutter",
  "🐰": "hop",
  "🐷": "roll",
  "🦋": "flutter",
};

// モーション装飾（波・風船・虹）。キャラサイズ基準の小さなSVG1個
function MotionDecoration({
  motion,
  size,
}: {
  motion: CharMotion;
  size: number;
}) {
  if (motion === "swim") {
    // 波: キャラの下に重ねる（キャラの揺れとは独立にゆらゆら）
    const w = size * 1.5;
    return (
      <svg
        width={w}
        height={size * 0.4}
        viewBox="0 0 150 40"
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: -size * 0.12,
          animation: "charWaveDrift 2.4s ease-in-out infinite",
        }}
        aria-hidden
      >
        <path
          d="M0 22 Q12 10 25 22 T50 22 T75 22 T100 22 T125 22 T150 22 L150 40 L0 40 Z"
          fill="#A8D8F0"
          opacity="0.9"
        />
        <path
          d="M0 30 Q15 20 30 30 T60 30 T90 30 T120 30 T150 30 L150 40 L0 40 Z"
          fill="#7FC3E8"
          opacity="0.9"
        />
      </svg>
    );
  }
  if (motion === "balloon") {
    // 風船: キャラの上（キャラと一緒に揺れるようモーションラッパー内で使う）
    const w = size * 0.5;
    return (
      <svg
        width={w}
        height={size * 0.85}
        viewBox="0 0 50 85"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: -size * 0.72 }}
        aria-hidden
      >
        <ellipse cx="25" cy="22" rx="16" ry="20" fill="#F7A8B8" />
        <ellipse cx="19" cy="15" rx="5" ry="7" fill="#FBD3DC" />
        <path d="M25 42 L22 47 L28 47 Z" fill="#E88AA0" />
        <path d="M25 47 Q20 60 25 70 Q30 78 25 85" stroke="#C97A8E" strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  if (motion === "rainbowSlide") {
    // 虹: キャラの下の小さな弧
    const w = size * 1.3;
    return (
      <svg
        width={w}
        height={size * 0.45}
        viewBox="0 0 130 45"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: -size * 0.16 }}
        aria-hidden
      >
        <path d="M5 45 A60 60 0 0 1 125 45" stroke="#F49FB6" strokeWidth="7" fill="none" />
        <path d="M13 45 A52 52 0 0 1 117 45" stroke="#F7CE84" strokeWidth="7" fill="none" />
        <path d="M21 45 A44 44 0 0 1 109 45" stroke="#9FD8B4" strokeWidth="7" fill="none" />
        <path d="M29 45 A36 36 0 0 1 101 45" stroke="#9EC5EC" strokeWidth="7" fill="none" />
      </svg>
    );
  }
  return null;
}

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
        // 吹き出しの色・アイコンはお知らせの緊急度に連動（指示書48。カード枠と同じ色体系）
        const urgency = URGENCY_META[urgencyOf(item)];

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
              {/* 吹き出し（キャラの上・新着タイトルを表示／文字切れ防止のパディング）
                  色・アイコンは緊急度連動: 緊急=赤🚨+点滅 / 準緊急=アンバー⚠️ / 通常=緑📢。
                  点滅(animate-pulse)はラッパー側に付けて本体のanimate-bounceと共存させる */}
              <div
                className={`absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full ${urgency.bubblePulse}`}
              >
                <div
                  className={`${urgency.bubble} text-xs leading-none py-2 px-4 rounded-full shadow-lg animate-bounce flex items-center gap-1 max-w-[220px]`}
                >
                  <span className="shrink-0">{urgency.bubbleIcon}</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.title}
                  </span>
                </div>
                <div
                  className={`w-2 h-2 ${urgency.bubbleTail} rotate-45 mx-auto -mt-1`}
                />
              </div>

              {/* キャラクター本体（133-C: 相性の合うキャラは固有モーションを内側ラッパーで適用） */}
              {(() => {
                const motion = useSvg
                  ? SVG_MOTIONS[svgType]
                  : EMOJI_MOTIONS[emojiChar];
                const body = useSvg ? (
                  <CharacterSVG type={svgType} size={settings.size} />
                ) : (
                  <div
                    style={{ fontSize: settings.size, lineHeight: 1 }}
                    className="select-none"
                  >
                    {emojiChar}
                  </div>
                );
                if (!motion) return body; // 対応表に無いキャラは従来どおり
                return (
                  <div className="relative">
                    {/* 波・虹はキャラの揺れと独立（外側）。風船はキャラと一緒に揺れる（内側） */}
                    {(motion === "swim" || motion === "rainbowSlide") && (
                      <MotionDecoration motion={motion} size={settings.size} />
                    )}
                    <div
                      className="relative"
                      style={{ animation: MOTION_ANIMATION[motion] }}
                    >
                      {motion === "balloon" && (
                        <MotionDecoration
                          motion={motion}
                          size={settings.size}
                        />
                      )}
                      {body}
                    </div>
                  </div>
                );
              })()}
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
    shiba: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M25 22 L20 46 L40 36 Z" fill="#d99a4e" />
        <path d="M75 22 L80 46 L60 36 Z" fill="#d99a4e" />
        <path d="M28 27 L25 42 L37 36 Z" fill="#f3e0c8" />
        <path d="M72 27 L75 42 L63 36 Z" fill="#f3e0c8" />
        <circle cx="50" cy="56" r="30" fill="#d99a4e" />
        <path
          d="M50 44 C36 44 27 55 27 66 C27 77 37 86 50 86 C63 86 73 77 73 66 C73 55 64 44 50 44 Z"
          fill="#f7ecd9"
        />
        <circle cx="39" cy="52" r="3.8" fill="#2c2119" />
        <circle cx="61" cy="52" r="3.8" fill="#2c2119" />
        <circle cx="40.2" cy="50.8" r="1" fill="#fff" />
        <circle cx="62.2" cy="50.8" r="1" fill="#fff" />
        <ellipse cx="50" cy="63" rx="4.6" ry="3.4" fill="#2c2119" />
        <path
          d="M50 66 L50 70 M50 70 C46.5 73 44 72 43 70 M50 70 C53.5 73 56 72 57 70"
          stroke="#8a6238"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
    panda: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="28" cy="30" r="12" fill="#2c2c2c" />
        <circle cx="72" cy="30" r="12" fill="#2c2c2c" />
        <circle cx="50" cy="56" r="30" fill="#fbfbf8" />
        <ellipse
          cx="38"
          cy="52"
          rx="8"
          ry="10"
          transform="rotate(-18 38 52)"
          fill="#2c2c2c"
        />
        <ellipse
          cx="62"
          cy="52"
          rx="8"
          ry="10"
          transform="rotate(18 62 52)"
          fill="#2c2c2c"
        />
        <circle cx="39.5" cy="52" r="3" fill="#fff" />
        <circle cx="60.5" cy="52" r="3" fill="#fff" />
        <circle cx="40" cy="52.5" r="1.6" fill="#1a1a1a" />
        <circle cx="60" cy="52.5" r="1.6" fill="#1a1a1a" />
        <ellipse cx="50" cy="66" rx="4.4" ry="3.2" fill="#2c2c2c" />
        <path
          d="M46 74 C48 76 52 76 54 74"
          stroke="#2c2c2c"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
    penguin: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="55" rx="27" ry="33" fill="#37474f" />
        <ellipse cx="50" cy="63" rx="18" ry="23" fill="#fbfbf8" />
        <path
          d="M23 48 C18 58 20 70 26 76 C29 68 28 56 27 50 Z"
          fill="#37474f"
        />
        <path
          d="M77 48 C82 58 80 70 74 76 C71 68 72 56 73 50 Z"
          fill="#37474f"
        />
        <circle cx="42" cy="42" r="3.4" fill="#0f1a1f" />
        <circle cx="58" cy="42" r="3.4" fill="#0f1a1f" />
        <circle cx="43" cy="41" r="0.9" fill="#fff" />
        <circle cx="59" cy="41" r="0.9" fill="#fff" />
        <path d="M50 46 L45 52 L55 52 Z" fill="#f6a13c" />
        <ellipse cx="42" cy="86" rx="6" ry="3" fill="#f6a13c" />
        <ellipse cx="58" cy="86" rx="6" ry="3" fill="#f6a13c" />
      </svg>
    ),
    hedgehog: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M50 18 L58 30 L70 24 L72 38 L86 38 L80 50 L90 58 L76 62 L80 76 L66 72 L60 84 L50 74 L40 84 L34 72 L20 76 L24 62 L10 58 L20 50 L14 38 L28 38 L30 24 L42 30 Z"
          fill="#8d6e63"
        />
        <circle cx="50" cy="58" r="24" fill="#a1887f" />
        <path
          d="M50 46 C39 46 31 55 31 64 C31 73 39 80 50 80 C61 80 69 73 69 64 C69 55 61 46 50 46 Z"
          fill="#f3e5dc"
        />
        <circle cx="42" cy="58" r="3.2" fill="#3e2723" />
        <circle cx="58" cy="58" r="3.2" fill="#3e2723" />
        <ellipse cx="50" cy="67" rx="3.8" ry="3" fill="#3e2723" />
        <path
          d="M45 73 C47 75 53 75 55 73"
          stroke="#6d4c41"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
    rainbow: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M14 78 A36 36 0 0 1 86 78 L76 78 A26 26 0 0 0 24 78 Z"
          fill="#ef6c6c"
        />
        <path
          d="M24 78 A26 26 0 0 1 76 78 L68 78 A18 18 0 0 0 32 78 Z"
          fill="#f6b04e"
        />
        <path
          d="M32 78 A18 18 0 0 1 68 78 L60 78 A10 10 0 0 0 40 78 Z"
          fill="#5cc06f"
        />
        <path
          d="M40 78 A10 10 0 0 1 60 78 L52 78 A2 2 0 0 0 48 78 Z"
          fill="#5b9bd5"
        />
        <circle cx="18" cy="76" r="7" fill="#eef2f5" />
        <circle cx="26" cy="79" r="6" fill="#f7f9fa" />
        <circle cx="82" cy="76" r="7" fill="#eef2f5" />
        <circle cx="74" cy="79" r="6" fill="#f7f9fa" />
      </svg>
    ),
    note: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M62 18 L62 66 M62 18 C70 22 76 26 76 34"
          stroke="#5e60ce"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse
          cx="52"
          cy="68"
          rx="12"
          ry="9"
          transform="rotate(-20 52 68)"
          fill="#5e60ce"
        />
        <path
          d="M28 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z"
          fill="#9fa8ff"
        />
        <path
          d="M80 54 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 z"
          fill="#9fa8ff"
        />
      </svg>
    ),
    clover: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g fill="#4caf6d">
          <path
            d="M50 52 C42 44 30 44 26 36 C22 28 30 20 38 24 C40 16 52 16 54 24 C62 20 70 28 66 36 C62 44 58 44 50 52 Z"
            transform="rotate(0 50 50)"
          />
          <path
            d="M50 52 C42 44 30 44 26 36 C22 28 30 20 38 24 C40 16 52 16 54 24 C62 20 70 28 66 36 C62 44 58 44 50 52 Z"
            transform="rotate(90 50 50)"
          />
          <path
            d="M50 52 C42 44 30 44 26 36 C22 28 30 20 38 24 C40 16 52 16 54 24 C62 20 70 28 66 36 C62 44 58 44 50 52 Z"
            transform="rotate(180 50 50)"
          />
          <path
            d="M50 52 C42 44 30 44 26 36 C22 28 30 20 38 24 C40 16 52 16 54 24 C62 20 70 28 66 36 C62 44 58 44 50 52 Z"
            transform="rotate(270 50 50)"
          />
        </g>
        <path
          d="M50 54 C52 66 56 76 62 84"
          stroke="#388e54"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="50" cy="50" r="4" fill="#7bd096" />
      </svg>
    ),
    butterfly: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path
          d="M50 50 C36 30 18 26 14 40 C11 52 28 60 46 56 Z"
          fill="#f48fb1"
        />
        <path
          d="M50 50 C64 30 82 26 86 40 C89 52 72 60 54 56 Z"
          fill="#f48fb1"
        />
        <path
          d="M50 54 C40 66 26 70 22 62 C19 55 32 50 46 54 Z"
          fill="#f8bbd0"
        />
        <path
          d="M50 54 C60 66 74 70 78 62 C81 55 68 50 54 54 Z"
          fill="#f8bbd0"
        />
        <circle cx="42" cy="42" r="3" fill="#fce4ec" />
        <circle cx="58" cy="42" r="3" fill="#fce4ec" />
        <ellipse cx="50" cy="52" rx="4" ry="12" fill="#7b4a63" />
        <path
          d="M47 40 C44 34 40 32 38 30 M53 40 C56 34 60 32 62 30"
          stroke="#7b4a63"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
    // ─── 133-B: オリジナル6体（院長採用・サンプルHTMLどおりのデザイン） ───
    mochi: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="62" rx="30" ry="26" fill="#FDF6F0" />
        <ellipse cx="50" cy="62" rx="30" ry="26" fill="none" stroke="#E8D5C4" strokeWidth="1.5" />
        <ellipse cx="33" cy="34" rx="8" ry="15" fill="#FDF6F0" stroke="#E8D5C4" strokeWidth="1.5" transform="rotate(-18 33 34)" />
        <ellipse cx="67" cy="34" rx="8" ry="15" fill="#FDF6F0" stroke="#E8D5C4" strokeWidth="1.5" transform="rotate(18 67 34)" />
        <ellipse cx="33" cy="36" rx="3.5" ry="9" fill="#F7CBD4" transform="rotate(-18 33 36)" />
        <ellipse cx="67" cy="36" rx="3.5" ry="9" fill="#F7CBD4" transform="rotate(18 67 36)" />
        <circle cx="41" cy="58" r="3.4" fill="#4a3f38" />
        <circle cx="59" cy="58" r="3.4" fill="#4a3f38" />
        <circle cx="33" cy="66" r="5" fill="#F9C8CE" opacity="0.8" />
        <circle cx="67" cy="66" r="5" fill="#F9C8CE" opacity="0.8" />
        <path d="M46 66 Q50 70 54 66" stroke="#4a3f38" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    happa: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M50 34 C42 20 28 18 22 24 C26 34 38 40 48 38 Z" fill="#1D9E75" />
        <path d="M52 32 C56 16 70 12 78 18 C76 30 64 38 54 36 Z" fill="#35B389" />
        <path d="M50 40 L50 30" stroke="#1D9E75" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="50" cy="66" rx="27" ry="24" fill="#DFF2E9" />
        <ellipse cx="50" cy="66" rx="27" ry="24" fill="none" stroke="#BCE0D0" strokeWidth="1.5" />
        <circle cx="42" cy="62" r="3.4" fill="#3e4a44" />
        <circle cx="58" cy="62" r="3.4" fill="#3e4a44" />
        <circle cx="35" cy="70" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="65" cy="70" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <path d="M46 70 Q50 74 54 70" stroke="#3e4a44" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    kumopi: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="32" cy="60" r="16" fill="#DCEBFB" />
        <circle cx="68" cy="60" r="16" fill="#DCEBFB" />
        <circle cx="50" cy="48" r="20" fill="#DCEBFB" />
        <rect x="26" y="58" width="48" height="18" rx="9" fill="#DCEBFB" />
        <circle cx="42" cy="56" r="3" fill="#4a5568" />
        <circle cx="58" cy="56" r="3" fill="#4a5568" />
        <circle cx="34" cy="63" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="63" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <path d="M46 63 Q50 67 54 63" stroke="#4a5568" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    piyomaru: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="58" r="28" fill="#FBEFC9" />
        <circle cx="50" cy="58" r="28" fill="none" stroke="#EFD9A0" strokeWidth="1.5" />
        <path d="M24 56 Q16 50 20 64 Q24 60 28 62 Z" fill="#F5E3AE" />
        <ellipse cx="70" cy="60" rx="9" ry="13" fill="#F5E3AE" transform="rotate(20 70 60)" />
        <circle cx="42" cy="52" r="3.4" fill="#57493a" />
        <circle cx="58" cy="52" r="3.4" fill="#57493a" />
        <path d="M46 58 L54 58 L50 64 Z" fill="#F2A25C" />
        <circle cx="34" cy="60" r="5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="60" r="5" fill="#F9C8CE" opacity="0.85" />
        <path d="M42 82 L42 87 M50 84 L50 89 M58 82 L58 87" stroke="#F2A25C" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    kogumaro: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="30" cy="36" r="9" fill="#F3E3CE" />
        <circle cx="70" cy="36" r="9" fill="#F3E3CE" />
        <circle cx="30" cy="36" r="4.5" fill="#E8CBA4" />
        <circle cx="70" cy="36" r="4.5" fill="#E8CBA4" />
        <ellipse cx="50" cy="58" rx="28" ry="26" fill="#F3E3CE" />
        <ellipse cx="50" cy="58" rx="28" ry="26" fill="none" stroke="#E0C49C" strokeWidth="1.5" />
        <circle cx="42" cy="54" r="3.4" fill="#544434" />
        <circle cx="58" cy="54" r="3.4" fill="#544434" />
        <ellipse cx="50" cy="62" rx="7" ry="5.5" fill="#FBF3E6" />
        <ellipse cx="50" cy="60.5" rx="3" ry="2.2" fill="#544434" />
        <path d="M47 64.5 Q50 67 53 64.5" stroke="#544434" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="61" r="4.5" fill="#F5B8BF" opacity="0.8" />
        <circle cx="67" cy="61" r="4.5" fill="#F5B8BF" opacity="0.8" />
        <path d="M28 76 Q50 86 72 76 L72 82 Q50 92 28 82 Z" fill="#1D9E75" />
        <rect x="60" y="78" width="9" height="14" rx="4" fill="#1D9E75" />
      </svg>
    ),
    azaran: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy="60" rx="32" ry="25" fill="#F1F4F6" />
        <ellipse cx="50" cy="60" rx="32" ry="25" fill="none" stroke="#D5DEE4" strokeWidth="1.5" />
        <ellipse cx="30" cy="76" rx="9" ry="5" fill="#E2E9ED" transform="rotate(-18 30 76)" />
        <ellipse cx="70" cy="76" rx="9" ry="5" fill="#E2E9ED" transform="rotate(18 70 76)" />
        <circle cx="41" cy="54" r="3.2" fill="#46525c" />
        <circle cx="59" cy="54" r="3.2" fill="#46525c" />
        <path d="M37 49 L41 47 M63 49 L59 47" stroke="#46525c" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="50" cy="61" rx="4" ry="3" fill="#46525c" />
        <path d="M46 66 Q50 69 54 66" stroke="#46525c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="67" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
  };
  return svgs[type] ?? svgs.cat;
}
