"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_SETTING_KEY,
} from "@/lib/gemini-models";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] =
    useState<string>(DEFAULT_GEMINI_MODEL);
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("content_store")
          .select("data")
          .eq("id", GEMINI_MODEL_SETTING_KEY)
          .single();
        const model = (data?.data as { model?: string } | null)?.model;
        if (model) setSelectedModel(model);
      } catch {
        /* 未設定時はデフォルトのまま */
      }
    };
    load();
  }, []);

  const handleSaveModel = async () => {
    setSavingModel(true);
    try {
      const { error } = await supabase.from("content_store").upsert({
        id: GEMINI_MODEL_SETTING_KEY,
        content_type: "gemini_model_setting",
        data: { model: selectedModel },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      alert("✅ モデル設定を保存しました");
    } catch {
      alert("保存に失敗しました");
    } finally {
      setSavingModel(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ AI設定</h1>
        <p className="text-sm text-gray-500 mt-1">
          管理画面の評価・分析機能で使用するGeminiモデルを選択します
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-lg font-medium text-gray-900 mb-1">
          🤖 Geminiモデル選択
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          ※ AIチャット・症例学習などのClaude機能には影響しません
        </p>

        <div className="space-y-2">
          {GEMINI_MODELS.map((m) => (
            <label
              key={m.id}
              className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                selectedModel === m.id
                  ? "border-teal-400 bg-teal-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="gemini-model"
                checked={selectedModel === m.id}
                onChange={() => setSelectedModel(m.id)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSaveModel}
          disabled={savingModel}
          className="mt-4 w-full py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {savingModel ? "保存中..." : "💾 モデル設定を保存"}
        </button>
      </div>
    </div>
  );
}
