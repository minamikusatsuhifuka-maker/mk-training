"use client";

import { useEffect, useState } from "react";
import { AI_BACKGROUND_KEY } from "@/lib/ai-background";
import { CLINIC_PHILOSOPHY } from "@/lib/clinic-philosophy";
import { loadPortalItems } from "@/lib/portal-store";
import { PORTAL_KEYS, type PolicyItem } from "@/types/portal";
// 145: anon 直アクセスを廃止し認証必須APIへ
import { getContentRow, putContentRow } from "@/lib/content-store-core";

// 既存の理念・経営方針から取り込み用のMarkdownを組み立てる
async function buildPrefill(): Promise<string> {
  let policyText = "";
  try {
    const policies = await loadPortalItems<PolicyItem>(PORTAL_KEYS.policy, []);
    const active = policies.find((p) => p.isActive) ?? policies[0];
    if (active) {
      policyText =
        `## 経営方針（${active.year}年度）\n` +
        `- パーパス：${active.purpose}\n` +
        `- ミッション：${active.mission}\n` +
        `- ビジョン：${active.vision}\n` +
        `- バリュー：${active.value}\n` +
        (active.fullText ? `\n${active.fullText}\n` : "");
    }
  } catch {
    /* 取得失敗時は理念のみ */
  }
  return [CLINIC_PHILOSOPHY.trim(), policyText.trim()]
    .filter(Boolean)
    .join("\n\n");
}

export default function AiBackgroundAdminPage() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const row = await getContentRow(AI_BACKGROUND_KEY);
        const raw = row?.data as { text?: string } | string | null;
        const saved = typeof raw === "string" ? raw : raw?.text ?? "";
        if (saved && saved.trim()) {
          setText(saved);
        } else {
          // 未設定なら理念・経営方針をプリフィル（保存はユーザー操作）
          setText(await buildPrefill());
        }
      } catch {
        setText(await buildPrefill());
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await putContentRow(AI_BACKGROUND_KEY, "ai_background", {
        text,
      });
      if (!ok) throw new Error("save failed");
      setSavedAt(new Date().toLocaleString("ja-JP"));
      alert("✅ AI背景情報を保存しました");
    } catch {
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    const prefill = await buildPrefill();
    if (
      text.trim() &&
      !confirm("現在の内容を、理念・経営方針の取り込み内容で置き換えますか？")
    )
      return;
    setText(prefill);
  };

  const charCount = text.length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          🧭 背景情報・理念管理
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          ここに入れた理念・方針が、相談・ロールプレイ・症例・成長ロードマップ・知識ベース生成など主要AIに共通で反映されます。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-medium text-slate-800">
            共通背景（Markdown可）
          </h2>
          <button
            type="button"
            onClick={handleImport}
            className="text-xs px-3 py-1.5 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50"
          >
            理念・経営方針を取り込む
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={20}
          disabled={!loaded}
          placeholder={
            loaded ? "理念・経営方針・価値観などを記入..." : "読み込み中..."
          }
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono leading-relaxed resize-y"
        />

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p
            className={`text-xs ${
              charCount > 4000 ? "text-amber-600" : "text-slate-600"
            }`}
          >
            {charCount.toLocaleString()} 字（目安: 2,000〜4,000字程度に収めると安定。注入時は6,000字でトリム）
          </p>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-xs text-slate-600">保存: {savedAt}</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !loaded}
              className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "💾 保存"}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          ※ 空にして保存すると、各AIプロンプトから共通背景ブロックが省略されます（エラーにはなりません）。
        </p>
      </div>
    </div>
  );
}
