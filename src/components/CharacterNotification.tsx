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
  "rakkon", // 135
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
  | "roll" // ころころ転がる
  | "sway" // 葉がそよぐようにそよそよ（135）
  | "trot" // とことこ小走り（136）
  | "waddle" // よちよち（136）
  | "twinkle" // きらきら瞬き（136）
  | "flit"; // ひらひら蛇行（136）

const MOTION_ANIMATION: Record<CharMotion, string> = {
  swim: "charMotionSwim 1.6s ease-in-out infinite",
  float: "charMotionFloat 2.4s ease-in-out infinite",
  flutter: "charMotionFlutter 0.5s ease-in-out infinite",
  hop: "charMotionHop 1.2s ease-in-out infinite",
  balloon: "charMotionBalloon 2.2s ease-in-out infinite",
  rainbowSlide: "charMotionFloat 2.8s ease-in-out infinite",
  roll: "charMotionRoll 1.6s linear infinite",
  sway: "charMotionSway 2.6s ease-in-out infinite",
  trot: "charMotionTrot 0.4s ease-in-out infinite",
  waddle: "charMotionWaddle 0.55s ease-in-out infinite",
  twinkle: "charMotionTwinkle 1.4s ease-in-out infinite",
  flit: "charMotionFlit 2.2s ease-in-out infinite",
};

// 136: 全24キャラに割当（横切りのみのキャラをなくす）
const SVG_MOTIONS: Record<CharacterSvgType, CharMotion> = {
  // 波乗り
  rakkon: "swim", // らっこん（135・院長の当初要望）
  azaran: "swim",
  // ふわふわ
  kumopi: "float",
  moon: "float",
  // ぱたぱた
  piyomaru: "flutter",
  bird: "flutter",
  // ぴょんぴょん
  mochi: "hop",
  rabbit: "hop",
  note: "hop", // 音符はリズムに乗って跳ねる
  // 風船・虹
  kogumaro: "balloon",
  rainbow: "rainbowSlide",
  // そよそよ
  happa: "sway",
  sprout: "sway",
  sakura: "sway",
  clover: "sway",
  // ころころ
  panda: "roll",
  hedgehog: "roll", // まるまって転がる
  // とことこ
  cat: "trot",
  dog: "trot",
  shiba: "trot",
  chihuahua: "trot",
  // 専用
  star: "twinkle",
  penguin: "waddle",
  butterfly: "flit",
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
    // 風船: キャラの左横やや上（135: 吹き出し（中央上）と競合しない位置＋z-20の背面）
    const w = size * 0.5;
    return (
      <svg
        width={w}
        height={size * 0.85}
        viewBox="0 0 50 85"
        className="absolute"
        style={{ top: -size * 0.5, left: -size * 0.38 }}
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

// 固有モーション＋装飾つきのキャラ本体（137: 通知アニメ本体と管理画面プレビューで共用）。
// svgType か emoji のどちらかを渡す。対応表に無いキャラは静止（従来の横切りのみ）。
export function MotionCharacter({
  svgType,
  emoji,
  size,
}: {
  svgType?: CharacterSvgType;
  emoji?: string;
  size: number;
}) {
  const motion = svgType
    ? SVG_MOTIONS[svgType]
    : emoji
      ? EMOJI_MOTIONS[emoji]
      : undefined;
  const body = svgType ? (
    <CharacterSVG type={svgType} size={size} />
  ) : (
    <div style={{ fontSize: size, lineHeight: 1 }} className="select-none">
      {emoji}
    </div>
  );
  if (!motion) return body;
  return (
    <div className="relative">
      {/* 波・虹はキャラの揺れと独立（外側）。風船はキャラと一緒に揺れる（内側） */}
      {(motion === "swim" || motion === "rainbowSlide") && (
        <MotionDecoration motion={motion} size={size} />
      )}
      <div className="relative" style={{ animation: MOTION_ANIMATION[motion] }}>
        {motion === "balloon" && (
          <MotionDecoration motion={motion} size={size} />
        )}
        {body}
      </div>
    </div>
  );
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
              {/* 135: 吹き出しは常に最前面（モーション装飾・キャラが文字に重ならない根治） */}
              <div
                className={`absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full z-20 ${urgency.bubblePulse}`}
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

              {/* キャラクター本体（133-C/137: 固有モーションは MotionCharacter に共通化） */}
              <MotionCharacter
                svgType={useSvg ? svgType : undefined}
                emoji={useSvg ? undefined : emojiChar}
                size={settings.size}
              />
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
    // ─── 136: 既存17種の全面リデザイン（オリジナル6体テイスト: 丸・パステル・ほっぺ） ───
    cat: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M30 38 L24 20 Q34 24 40 32 Z" fill="#F8DDC0" stroke="#E5BE94" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M70 38 L76 20 Q66 24 60 32 Z" fill="#F8DDC0" stroke="#E5BE94" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M30 36 L26.5 24 Q33 27 37 32 Z" fill="#F7C1CC" />
        <path d="M70 36 L73.5 24 Q67 27 63 32 Z" fill="#F7C1CC" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="#F8DDC0" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="none" stroke="#E5BE94" strokeWidth="1.5" />
        <circle cx="41" cy="56" r="3.2" fill="#4a4038" />
        <circle cx="59" cy="56" r="3.2" fill="#4a4038" />
        <ellipse cx="50" cy="61" rx="2.4" ry="1.8" fill="#E58FA3" />
        <path d="M47 64 Q48.5 66 50 64 Q51.5 66 53 64" stroke="#4a4038" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="64" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="67" cy="64" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <path d="M20 60 L28 61 M20 66 L28 65 M80 60 L72 61 M80 66 L72 65" stroke="#D9B48C" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    dog: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="26" cy="46" rx="9" ry="16" fill="#D9A96E" transform="rotate(14 26 46)" />
        <ellipse cx="74" cy="46" rx="9" ry="16" fill="#D9A96E" transform="rotate(-14 74 46)" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="#EFD3AC" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="none" stroke="#DBB782" strokeWidth="1.5" />
        <circle cx="41" cy="55" r="3.2" fill="#4a4038" />
        <circle cx="59" cy="55" r="3.2" fill="#4a4038" />
        <ellipse cx="50" cy="63" rx="8" ry="6" fill="#FBF1DF" />
        <ellipse cx="50" cy="61" rx="3.2" ry="2.4" fill="#4a4038" />
        <path d="M46.5 65.5 Q50 68 53.5 65.5" stroke="#4a4038" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="68" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    rabbit: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="40" cy="28" rx="7.5" ry="19" fill="#FBEFF2" stroke="#EDCAD4" strokeWidth="1.5" transform="rotate(-6 40 28)" />
        <ellipse cx="60" cy="28" rx="7.5" ry="19" fill="#FBEFF2" stroke="#EDCAD4" strokeWidth="1.5" transform="rotate(6 60 28)" />
        <ellipse cx="40" cy="30" rx="3.2" ry="12" fill="#F6BFCE" transform="rotate(-6 40 30)" />
        <ellipse cx="60" cy="30" rx="3.2" ry="12" fill="#F6BFCE" transform="rotate(6 60 30)" />
        <ellipse cx="50" cy="63" rx="27" ry="24" fill="#FBEFF2" />
        <ellipse cx="50" cy="63" rx="27" ry="24" fill="none" stroke="#EDCAD4" strokeWidth="1.5" />
        <circle cx="42" cy="59" r="3.2" fill="#4a4044" />
        <circle cx="58" cy="59" r="3.2" fill="#4a4044" />
        <ellipse cx="50" cy="65" rx="2.6" ry="2" fill="#E58FA3" />
        <path d="M46.5 68.5 Q50 71 53.5 68.5" stroke="#4a4044" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="34" cy="66" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="66" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    bird: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="58" r="27" fill="#CFE4F7" />
        <circle cx="50" cy="58" r="27" fill="none" stroke="#A9CBE8" strokeWidth="1.5" />
        <path d="M25 58 Q14 52 18 66 Q22 62 27 64 Z" fill="#B4D4EE" />
        <path d="M75 58 Q86 52 82 66 Q78 62 73 64 Z" fill="#B4D4EE" />
        <path d="M44 31 Q50 23 56 31 Q53 28 50 29 Q47 28 44 31 Z" fill="#B4D4EE" />
        <circle cx="42" cy="53" r="3.2" fill="#44505c" />
        <circle cx="58" cy="53" r="3.2" fill="#44505c" />
        <path d="M46 59 L54 59 L50 65 Z" fill="#F2B25C" />
        <circle cx="34" cy="61" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="61" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    chihuahua: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M26 34 L20 14 Q32 18 38 28 Z" fill="#5A5350" stroke="#474140" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M74 34 L80 14 Q68 18 62 28 Z" fill="#5A5350" stroke="#474140" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M27 31 L23.5 18 Q31 21 35 27 Z" fill="#D9A56E" />
        <path d="M73 31 L76.5 18 Q69 21 65 27 Z" fill="#D9A56E" />
        <ellipse cx="50" cy="60" rx="28" ry="25" fill="#5A5350" />
        <ellipse cx="50" cy="60" rx="28" ry="25" fill="none" stroke="#474140" strokeWidth="1.5" />
        <ellipse cx="41" cy="48" rx="4.5" ry="3" fill="#D9A56E" />
        <ellipse cx="59" cy="48" rx="4.5" ry="3" fill="#D9A56E" />
        <circle cx="41" cy="56" r="3.2" fill="#2e2a28" />
        <circle cx="59" cy="56" r="3.2" fill="#2e2a28" />
        <circle cx="42" cy="55" r="1" fill="#ffffff" />
        <circle cx="60" cy="55" r="1" fill="#ffffff" />
        <ellipse cx="50" cy="66" rx="9" ry="7" fill="#D9A56E" />
        <ellipse cx="50" cy="63.5" rx="3.2" ry="2.4" fill="#2e2a28" />
        <path d="M46.5 68 Q50 70.5 53.5 68" stroke="#2e2a28" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="31" cy="63" r="4.5" fill="#F5A9BC" opacity="0.9" />
        <circle cx="69" cy="63" r="4.5" fill="#F5A9BC" opacity="0.9" />
      </svg>
    ),
    sakura: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g fill="#F9D5E0" stroke="#F0B7C8" strokeWidth="1.5">
          <ellipse cx="50" cy="24" rx="12" ry="15" />
          <ellipse cx="75" cy="42" rx="12" ry="15" transform="rotate(72 75 42)" />
          <ellipse cx="65" cy="71" rx="12" ry="15" transform="rotate(144 65 71)" />
          <ellipse cx="35" cy="71" rx="12" ry="15" transform="rotate(216 35 71)" />
          <ellipse cx="25" cy="42" rx="12" ry="15" transform="rotate(288 25 42)" />
        </g>
        <circle cx="50" cy="50" r="17" fill="#FBE3EA" stroke="#F0B7C8" strokeWidth="1.5" />
        <circle cx="44" cy="48" r="2.8" fill="#4a4044" />
        <circle cx="56" cy="48" r="2.8" fill="#4a4044" />
        <path d="M46.5 54 Q50 57 53.5 54" stroke="#4a4044" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="38" cy="53" r="3.8" fill="#F49FB6" opacity="0.8" />
        <circle cx="62" cy="53" r="3.8" fill="#F49FB6" opacity="0.8" />
      </svg>
    ),
    sprout: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M50 42 L50 30" stroke="#7CBF9E" strokeWidth="3" strokeLinecap="round" />
        <path d="M50 32 C43 18 30 15 24 21 C28 32 40 37 50 34 Z" fill="#A9DCC3" stroke="#7CBF9E" strokeWidth="1.5" />
        <path d="M50 32 C57 18 70 15 76 21 C72 32 60 37 50 34 Z" fill="#8FD0B0" stroke="#7CBF9E" strokeWidth="1.5" />
        <ellipse cx="50" cy="64" rx="26" ry="22" fill="#EAF6EF" />
        <ellipse cx="50" cy="64" rx="26" ry="22" fill="none" stroke="#BFE0CE" strokeWidth="1.5" />
        <circle cx="42" cy="61" r="3.2" fill="#3e4a44" />
        <circle cx="58" cy="61" r="3.2" fill="#3e4a44" />
        <path d="M46.5 67 Q50 70 53.5 67" stroke="#3e4a44" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="34" cy="67" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="67" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    star: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M50 14 L59 36 L83 38 L64 54 L71 78 L50 64 L29 78 L36 54 L17 38 L41 36 Z" fill="#FBE7A9" stroke="#FBE7A9" strokeWidth="12" strokeLinejoin="round" />
        <circle cx="44" cy="48" r="2.8" fill="#5a4c30" />
        <circle cx="56" cy="48" r="2.8" fill="#5a4c30" />
        <path d="M46.5 54 Q50 57 53.5 54" stroke="#5a4c30" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="38" cy="53" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="62" cy="53" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="80" cy="18" r="2" fill="#FBE7A9" />
        <circle cx="20" cy="16" r="1.5" fill="#FBE7A9" />
      </svg>
    ),
    moon: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M60 12 A40 40 0 1 0 60 88 A33 33 0 1 1 60 12 Z" fill="#FBEBB4" stroke="#EAD188" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M30 45 Q33 42 36 45 M44 45 Q47 42 50 45" stroke="#5a4c30" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M37 55 Q40 58 43 55" stroke="#5a4c30" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="27" cy="52" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="53" cy="52" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <path d="M74 30 L76 35 L81 37 L76 39 L74 44 L72 39 L67 37 L72 35 Z" fill="#FBEBB4" />
      </svg>
    ),
    shiba: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M28 36 L24 18 Q34 22 39 30 Z" fill="#F0BE8A" stroke="#D9A167" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M72 36 L76 18 Q66 22 61 30 Z" fill="#F0BE8A" stroke="#D9A167" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M28.5 33 L26 22 Q32 25 35.5 30 Z" fill="#F7E1C8" />
        <path d="M71.5 33 L74 22 Q68 25 64.5 30 Z" fill="#F7E1C8" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="#F0BE8A" />
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="none" stroke="#D9A167" strokeWidth="1.5" />
        <ellipse cx="50" cy="66" rx="13" ry="10" fill="#FBF0DF" />
        <ellipse cx="41" cy="48.5" rx="3" ry="1.8" fill="#F7E1C8" />
        <ellipse cx="59" cy="48.5" rx="3" ry="1.8" fill="#F7E1C8" />
        <circle cx="41" cy="54" r="3.2" fill="#4a4038" />
        <circle cx="59" cy="54" r="3.2" fill="#4a4038" />
        <ellipse cx="50" cy="62" rx="3.2" ry="2.4" fill="#4a4038" />
        <path d="M46.5 66.5 Q50 69 53.5 66.5" stroke="#4a4038" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="31" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="69" cy="62" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    panda: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="28" cy="34" r="10" fill="#6B6560" />
        <circle cx="72" cy="34" r="10" fill="#6B6560" />
        <ellipse cx="50" cy="58" rx="29" ry="26" fill="#FDFBF7" />
        <ellipse cx="50" cy="58" rx="29" ry="26" fill="none" stroke="#DDD5CB" strokeWidth="1.5" />
        <ellipse cx="40" cy="53" rx="6.5" ry="8" fill="#6B6560" transform="rotate(-14 40 53)" />
        <ellipse cx="60" cy="53" rx="6.5" ry="8" fill="#6B6560" transform="rotate(14 60 53)" />
        <circle cx="41" cy="54" r="2.6" fill="#FDFBF7" />
        <circle cx="41" cy="54" r="1.4" fill="#332f2c" />
        <circle cx="59" cy="54" r="2.6" fill="#FDFBF7" />
        <circle cx="59" cy="54" r="1.4" fill="#332f2c" />
        <ellipse cx="50" cy="63" rx="3" ry="2.2" fill="#332f2c" />
        <path d="M46.5 67 Q50 69.5 53.5 67" stroke="#332f2c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="31" cy="63" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="69" cy="63" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    penguin: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="24" cy="58" rx="6" ry="13" fill="#A9C3DC" stroke="#87A8C8" strokeWidth="1.5" transform="rotate(16 24 58)" />
        <ellipse cx="76" cy="58" rx="6" ry="13" fill="#A9C3DC" stroke="#87A8C8" strokeWidth="1.5" transform="rotate(-16 76 58)" />
        <ellipse cx="41" cy="86" rx="7" ry="3.5" fill="#F2B25C" />
        <ellipse cx="59" cy="86" rx="7" ry="3.5" fill="#F2B25C" />
        <ellipse cx="50" cy="56" rx="27" ry="30" fill="#A9C3DC" />
        <ellipse cx="50" cy="56" rx="27" ry="30" fill="none" stroke="#87A8C8" strokeWidth="1.5" />
        <ellipse cx="50" cy="63" rx="18" ry="20" fill="#FDFBF7" />
        <circle cx="42" cy="46" r="3.2" fill="#3c4650" />
        <circle cx="58" cy="46" r="3.2" fill="#3c4650" />
        <path d="M46 52 L54 52 L50 58 Z" fill="#F2B25C" />
        <circle cx="34" cy="53" r="4.5" fill="#F9C8CE" opacity="0.85" />
        <circle cx="66" cy="53" r="4.5" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    hedgehog: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M50 16 L58 28 L70 22 L72 36 L86 38 L78 48 L90 56 L78 62 L82 76 L68 72 L62 84 L52 74 L42 84 L34 76 L30 70 L18 72 L24 58 L12 54 L24 46 L16 36 L30 36 L32 22 L44 28 Z" fill="#C9AB8B" stroke="#C9AB8B" strokeWidth="9" strokeLinejoin="round" />
        <ellipse cx="50" cy="60" rx="22" ry="19" fill="#F7E8D6" />
        <ellipse cx="50" cy="60" rx="22" ry="19" fill="none" stroke="#E2C9AC" strokeWidth="1.5" />
        <circle cx="43" cy="57" r="3" fill="#4a4038" />
        <circle cx="57" cy="57" r="3" fill="#4a4038" />
        <ellipse cx="50" cy="64" rx="3" ry="2.4" fill="#4a4038" />
        <path d="M46.5 68 Q50 70.5 53.5 68" stroke="#4a4038" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="35" cy="64" r="4" fill="#F9C8CE" opacity="0.85" />
        <circle cx="65" cy="64" r="4" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    rainbow: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M18 66 A32 32 0 0 1 82 66" stroke="#F4A9BD" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M26 66 A24 24 0 0 1 74 66" stroke="#F8D48E" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M34 66 A16 16 0 0 1 66 66" stroke="#A5D8B9" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M42 66 A8 8 0 0 1 58 66" stroke="#A9C7ED" strokeWidth="8" fill="none" strokeLinecap="round" />
        <circle cx="20" cy="68" r="9" fill="#FDFBF7" stroke="#E4E9EE" strokeWidth="1.5" />
        <circle cx="17" cy="67" r="1.6" fill="#4a5058" />
        <circle cx="23" cy="67" r="1.6" fill="#4a5058" />
        <path d="M18 70.5 Q20 72 22 70.5" stroke="#4a5058" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <circle cx="80" cy="68" r="9" fill="#FDFBF7" stroke="#E4E9EE" strokeWidth="1.5" />
        <circle cx="77" cy="67" r="1.6" fill="#4a5058" />
        <circle cx="83" cy="67" r="1.6" fill="#4a5058" />
        <path d="M78 70.5 Q80 72 82 70.5" stroke="#4a5058" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    ),
    note: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M62 22 L62 62" stroke="#B9A6D9" strokeWidth="6" strokeLinecap="round" />
        <path d="M62 22 Q80 26 78 42 Q72 34 62 34 Z" fill="#B9A6D9" />
        <ellipse cx="46" cy="68" rx="17" ry="14" fill="#CDBCE8" />
        <ellipse cx="46" cy="68" rx="17" ry="14" fill="none" stroke="#B9A6D9" strokeWidth="1.5" />
        <circle cx="40" cy="66" r="2.8" fill="#4c4258" />
        <circle cx="52" cy="66" r="2.8" fill="#4c4258" />
        <path d="M43 72 Q46 74.5 49 72" stroke="#4c4258" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="71" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="59" cy="71" r="3.8" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    clover: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M52 74 Q54 84 60 88" stroke="#8FC7A5" strokeWidth="3" fill="none" strokeLinecap="round" />
        <g fill="#B7DFC5" stroke="#8FC7A5" strokeWidth="1.5">
          <circle cx="38" cy="36" r="14" />
          <circle cx="62" cy="36" r="14" />
          <circle cx="38" cy="60" r="14" />
          <circle cx="62" cy="60" r="14" />
        </g>
        <circle cx="50" cy="48" r="15" fill="#DFF2E6" stroke="#B7DFC5" strokeWidth="1.5" />
        <circle cx="44" cy="46" r="2.8" fill="#3e4a44" />
        <circle cx="56" cy="46" r="2.8" fill="#3e4a44" />
        <path d="M46.5 52 Q50 55 53.5 52" stroke="#3e4a44" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="39" cy="51" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="61" cy="51" r="3.8" fill="#F9C8CE" opacity="0.85" />
      </svg>
    ),
    butterfly: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g fill="#F5C1D3" stroke="#E79FB8" strokeWidth="1.5">
          <ellipse cx="30" cy="38" rx="17" ry="14" transform="rotate(-24 30 38)" />
          <ellipse cx="70" cy="38" rx="17" ry="14" transform="rotate(24 70 38)" />
        </g>
        <g fill="#CBB7E8" stroke="#AE95D6" strokeWidth="1.5">
          <ellipse cx="34" cy="62" rx="12" ry="10" transform="rotate(18 34 62)" />
          <ellipse cx="66" cy="62" rx="12" ry="10" transform="rotate(-18 66 62)" />
        </g>
        <circle cx="31" cy="37" r="4" fill="#FBE3EC" />
        <circle cx="69" cy="37" r="4" fill="#FBE3EC" />
        <path d="M46 40 Q42 32 38 30 M54 40 Q58 32 62 30" stroke="#AE95D6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="38" cy="29" r="2" fill="#CBB7E8" />
        <circle cx="62" cy="29" r="2" fill="#CBB7E8" />
        <ellipse cx="50" cy="52" rx="9" ry="15" fill="#F7EBDD" stroke="#E4CDB4" strokeWidth="1.5" />
        <circle cx="46.5" cy="49" r="2.4" fill="#4a4044" />
        <circle cx="53.5" cy="49" r="2.4" fill="#4a4044" />
        <path d="M47 55 Q50 57.5 53 55" stroke="#4a4044" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="43" cy="53" r="2.8" fill="#F9C8CE" opacity="0.9" />
        <circle cx="57" cy="53" r="2.8" fill="#F9C8CE" opacity="0.9" />
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
    // 135: らっこん — 仰向けでぷかぷか浮かぶラッコ（全体像が見える・波乗りモーション担当）
    rakkon: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 仰向けのからだ（横長）＋おなかの明るい毛色 */}
        <ellipse cx="55" cy="62" rx="31" ry="16" fill="#C9A182" />
        <ellipse cx="55" cy="62" rx="31" ry="16" fill="none" stroke="#B08A66" strokeWidth="1.5" />
        <ellipse cx="58" cy="58" rx="20" ry="9" fill="#EBD9C3" />
        {/* しっぽ（右）と後ろあし（ひれ） */}
        <ellipse cx="88" cy="60" rx="8" ry="4.5" fill="#B08A66" transform="rotate(-20 88 60)" />
        <ellipse cx="80" cy="52" rx="5" ry="3" fill="#C9A182" transform="rotate(-35 80 52)" />
        {/* あたま（左）＋耳＋明るい顔まわり */}
        <circle cx="24" cy="52" r="15" fill="#C9A182" />
        <circle cx="24" cy="52" r="15" fill="none" stroke="#B08A66" strokeWidth="1.5" />
        <circle cx="13" cy="42" r="3.5" fill="#B08A66" />
        <circle cx="35" cy="42" r="3.5" fill="#B08A66" />
        <circle cx="24" cy="54" r="11" fill="#EBD9C3" />
        {/* 顔（目・鼻・くち・ほっぺ） */}
        <circle cx="19" cy="51" r="2.8" fill="#4a3f33" />
        <circle cx="29" cy="51" r="2.8" fill="#4a3f33" />
        <ellipse cx="24" cy="56" rx="3" ry="2.2" fill="#4a3f33" />
        <path d="M21 60 Q24 62.5 27 60" stroke="#4a3f33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="14" cy="57" r="3.8" fill="#F9C8CE" opacity="0.85" />
        <circle cx="34" cy="57" r="3.8" fill="#F9C8CE" opacity="0.85" />
        {/* 両手でおなかの貝がらを抱える */}
        <circle cx="47" cy="53" r="4.5" fill="#C9A182" />
        <circle cx="59" cy="53" r="4.5" fill="#C9A182" />
        <path d="M53 44 L48 52 L58 52 Z" fill="#F4A8B8" />
        <path d="M53 44 L50.5 52 M53 44 L55.5 52" stroke="#E288A0" strokeWidth="1" />
      </svg>
    ),
  };
  return svgs[type] ?? svgs.cat;
}
