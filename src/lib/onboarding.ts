// オンボーディングチェックリスト（指示書113・機能ID onboarding）— 型・定数・正規化
// - テンプレ（項目定義）は content_store の単一キー onboarding_template（全員閲覧可・管理者編集）。
// - 個人のチェック進捗は private_store（content_type "onboarding"・record_key "progress" 固定・1人1レコード）。
//   閲覧は本人＋管理者のみ（基盤の既定そのまま。認可分岐の追加はしない・指示書113）。
// - id はラベル編集で変わらない不変ID（進捗のチェックが id に紐づく。編集でチェックが外れてはいけない）。
// - 項目削除後に進捗側へ残る孤児IDは無視する（正規化で害なし・エラーにしない）。

import { loadPortalObject, savePortalObject } from "./portal-store";

// ─── テンプレ（content_store） ───

export const ONBOARDING_TEMPLATE_KEY = "onboarding_template";

export type OnboardingItem = {
  id: string; // 不変ID
  label: string;
  note: string; // 補足（任意・空文字可）
  docId: string; // 資料庫参照（任意・空文字可）
};

export type OnboardingSection = {
  id: string; // 不変ID
  title: string; // 段階名（例: 最初の1週間）
  items: OnboardingItem[];
};

export type OnboardingTemplate = {
  sections: OnboardingSection[];
  updatedAt: string;
};

export function emptyOnboardingTemplate(): OnboardingTemplate {
  return { sections: [], updatedAt: "" };
}

// 不変IDの採番（ラベル編集では再採番しない）
export function genOnboardingId(): string {
  return crypto.randomUUID();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeOnboardingTemplate(raw: unknown): OnboardingTemplate {
  if (!raw || typeof raw !== "object") return emptyOnboardingTemplate();
  const g = raw as Record<string, unknown>;
  const sections: OnboardingSection[] = [];
  if (Array.isArray(g.sections)) {
    for (const s of g.sections) {
      if (!s || typeof s !== "object") continue;
      const so = s as Record<string, unknown>;
      const id = str(so.id);
      if (!id) continue; // id の無いセクションは不正データとして捨てる
      const items: OnboardingItem[] = [];
      if (Array.isArray(so.items)) {
        for (const it of so.items) {
          if (!it || typeof it !== "object") continue;
          const io = it as Record<string, unknown>;
          const itemId = str(io.id);
          if (!itemId) continue;
          items.push({
            id: itemId,
            label: str(io.label),
            note: str(io.note),
            docId: str(io.docId),
          });
        }
      }
      sections.push({ id, title: str(so.title), items });
    }
  }
  return { sections, updatedAt: str(g.updatedAt) };
}

export async function loadOnboardingTemplate(): Promise<OnboardingTemplate> {
  const raw = await loadPortalObject<unknown>(ONBOARDING_TEMPLATE_KEY, null);
  return normalizeOnboardingTemplate(raw);
}

export async function saveOnboardingTemplate(
  template: OnboardingTemplate
): Promise<boolean> {
  return savePortalObject(ONBOARDING_TEMPLATE_KEY, {
    sections: template.sections,
    updatedAt: new Date().toISOString(),
  });
}

// ─── 進捗（private_store / content_type "onboarding"） ───

// 1人1レコードの固定キー（RECORD_KEY_RE 適合・upsert の一意単位 (owner, content_type, record_key) で自然に成立）
export const ONBOARDING_PROGRESS_KEY = "progress";

export type OnboardingProgressData = {
  checked: Record<string, string>; // 項目ID → チェックしたISO日時
  updatedAt: string;
};

export function emptyOnboardingProgress(): OnboardingProgressData {
  return { checked: {}, updatedAt: "" };
}

export function normalizeOnboardingProgress(
  raw: unknown
): OnboardingProgressData {
  if (!raw || typeof raw !== "object") return emptyOnboardingProgress();
  const g = raw as Record<string, unknown>;
  const checked: Record<string, string> = {};
  if (g.checked && typeof g.checked === "object" && !Array.isArray(g.checked)) {
    for (const [k, v] of Object.entries(g.checked as Record<string, unknown>)) {
      if (typeof v === "string" && v) checked[k] = v;
    }
  }
  return { checked, updatedAt: str(g.updatedAt) };
}

// 進捗集計。テンプレに現存する項目IDだけを数える＝孤児ID（削除済み項目のチェック）は自然に無視される
export function countOnboardingProgress(
  template: OnboardingTemplate,
  progress: OnboardingProgressData
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of template.sections) {
    for (const it of s.items) {
      total += 1;
      if (progress.checked[it.id]) done += 1;
    }
  }
  return { done, total };
}

// ─── 画面文言（指示書113の指定どおり・そのまま使用） ───

export const ONBOARDING_INTRO =
  "ようこそ、南草津皮フ科へ。このチェックリストは、新しい仲間が安心して一歩ずつ進むための道しるべです。順番どおりでなくて大丈夫。分からないことは、いつでも周りに聞いてください。";

export const ONBOARDING_EMPTY_NOTE =
  "チェックリストは準備中です。もうすこしお待ちください。";
