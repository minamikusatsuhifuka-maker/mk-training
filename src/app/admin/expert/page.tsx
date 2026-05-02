"use client";

import { useEffect, useState } from "react";
import {
  EXPERT_ROLES,
  type ExpertRole,
  type ExpertSection,
  type ExpertItem,
  type ExpertLevel,
  type ExpertCategory,
} from "@/data/expertRoles";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { AdminBanner } from "@/components/AdminBanner";

const LEVEL_OPTIONS: { value: ExpertLevel; label: string }[] = [
  { value: "basic", label: "基礎" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

const CATEGORY_OPTIONS: { value: ExpertCategory; label: string }[] = [
  { value: "knowledge", label: "📖 知識" },
  { value: "skill", label: "⚡ スキル" },
  { value: "mindset", label: "💡 マインド" },
  { value: "action", label: "✅ 行動" },
];

const LEVEL_BADGE_CLASS: Record<ExpertLevel, string> = {
  basic: "bg-green-100 text-green-700 border-green-300",
  intermediate: "bg-blue-100 text-blue-700 border-blue-300",
  advanced: "bg-amber-100 text-amber-800 border-amber-300",
};

type ImproveSuggestion = {
  improvedTitle?: string;
  improvedDetail?: string;
  suggestion?: string;
};

type AddItemDraft = {
  title: string;
  detail: string;
  level: ExpertLevel;
  category: ExpertCategory;
};

export default function AdminExpertPage() {
  const [roles, setRoles] = useState<ExpertRole[]>(EXPERT_ROLES);
  const [activeRoleId, setActiveRoleId] = useState<string>(EXPERT_ROLES[0].id);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // AI改善提案（itemId -> suggestion）
  const [improveLoading, setImproveLoading] = useState<Set<string>>(new Set());
  const [improveSuggestions, setImproveSuggestions] = useState<Record<string, ImproveSuggestion>>({});

  // AI項目追加提案（sectionKey -> drafts）
  const [addLoading, setAddLoading] = useState<Set<string>>(new Set());
  const [addProposals, setAddProposals] = useState<Record<string, AddItemDraft[]>>({});
  const [selectedProposed, setSelectedProposed] = useState<Record<string, Set<number>>>({});

  // 初期ロード（Supabaseから取得）
  useEffect(() => {
    getContent<ExpertRole>(CONTENT_KEYS.expertRoles, EXPERT_ROLES)
      .then((result) => {
        if (result && result.length > 0) {
          setRoles(result);
          setConnected(true);
        }
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  const activeRole = roles.find((r) => r.id === activeRoleId) ?? roles[0];

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 全保存
  const handleSaveAll = async () => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.expertRoles, roles);
    setConnected(ok);
    setSaveMsg(
      ok
        ? "💾 保存しました（全スタッフに反映されます）"
        : "ローカルに保存しました（Supabase接続エラー）"
    );
    setTimeout(() => setSaveMsg(null), 3500);
    setSaving(false);
  };

  // ロール内のセクションを更新するヘルパ
  const updateActiveRole = (mut: (role: ExpertRole) => ExpertRole) => {
    setRoles((prev) => prev.map((r) => (r.id === activeRoleId ? mut(r) : r)));
  };

  // アイテムを更新
  const updateItem = (sectionId: string, itemId: string, patch: Partial<ExpertItem>) => {
    updateActiveRole((role) => ({
      ...role,
      sections: role.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            }
          : s
      ),
    }));
  };

  // アイテムを並び替え
  const moveItem = (sectionId: string, index: number, dir: -1 | 1) => {
    updateActiveRole((role) => ({
      ...role,
      sections: role.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const next = [...s.items];
        const target = index + dir;
        if (target < 0 || target >= next.length) return s;
        [next[index], next[target]] = [next[target], next[index]];
        return { ...s, items: next };
      }),
    }));
  };

  // アイテムを削除
  const deleteItem = (sectionId: string, itemId: string) => {
    if (!confirm("この項目を削除しますか？")) return;
    updateActiveRole((role) => ({
      ...role,
      sections: role.sections.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s
      ),
    }));
  };

  // 手動でアイテム追加
  const addEmptyItem = (sectionId: string) => {
    const newItem: ExpertItem = {
      id: `manual_${Date.now()}`,
      title: "",
      detail: "",
      level: "intermediate",
      category: "skill",
    };
    updateActiveRole((role) => ({
      ...role,
      sections: role.sections.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, newItem] } : s
      ),
    }));
  };

  // AI改善
  const handleAiImprove = async (item: ExpertItem, section: ExpertSection) => {
    if (!activeRole) return;
    setImproveLoading((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch("/api/expert-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          role: activeRole.title,
          section: section.title,
          item,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "AI改善エラー");
        return;
      }
      setImproveSuggestions((prev) => ({ ...prev, [item.id]: data }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "ネットワークエラー");
    } finally {
      setImproveLoading((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // AI改善: 適用
  const applyImprovement = (sectionId: string, itemId: string) => {
    const sug = improveSuggestions[itemId];
    if (!sug) return;
    updateItem(sectionId, itemId, {
      title: sug.improvedTitle ?? undefined,
      detail: sug.improvedDetail ?? undefined,
    });
    dismissSuggestion(itemId);
  };

  // AI改善: 却下
  const dismissSuggestion = (itemId: string) => {
    setImproveSuggestions((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  // AI項目追加
  const handleAiAddItems = async (section: ExpertSection) => {
    if (!activeRole) return;
    const sectionKey = `${activeRole.id}_${section.id}`;
    setAddLoading((prev) => new Set(prev).add(sectionKey));
    try {
      const res = await fetch("/api/expert-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_items",
          role: activeRole.title,
          section: section.title,
          existingItems: section.items.map((i) => ({ title: i.title, detail: i.detail })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "AI追加エラー");
        return;
      }
      const drafts: AddItemDraft[] = (data.newItems ?? []).map((n: Partial<AddItemDraft>) => ({
        title: n.title ?? "",
        detail: n.detail ?? "",
        level: (n.level as ExpertLevel) ?? "intermediate",
        category: (n.category as ExpertCategory) ?? "skill",
      }));
      setAddProposals((prev) => ({ ...prev, [sectionKey]: drafts }));
      setSelectedProposed((prev) => ({
        ...prev,
        [sectionKey]: new Set(drafts.map((_, i) => i)),
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "ネットワークエラー");
    } finally {
      setAddLoading((prev) => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
    }
  };

  const toggleSelectedProposed = (sectionKey: string, idx: number) => {
    setSelectedProposed((prev) => {
      const cur = new Set(prev[sectionKey] ?? []);
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      return { ...prev, [sectionKey]: cur };
    });
  };

  const addProposedItems = (section: ExpertSection) => {
    if (!activeRole) return;
    const sectionKey = `${activeRole.id}_${section.id}`;
    const drafts = addProposals[sectionKey] ?? [];
    const selected = selectedProposed[sectionKey] ?? new Set();
    const idPrefix = `ai_${Date.now()}_`;
    const additions: ExpertItem[] = drafts
      .filter((_, i) => selected.has(i))
      .map((d, i) => ({
        id: `${idPrefix}${i}`,
        title: d.title,
        detail: d.detail,
        level: d.level,
        category: d.category,
      }));
    if (additions.length === 0) {
      alert("追加する項目を選択してください");
      return;
    }
    updateActiveRole((role) => ({
      ...role,
      sections: role.sections.map((s) =>
        s.id === section.id ? { ...s, items: [...s.items, ...additions] } : s
      ),
    }));
    // クリア
    setAddProposals((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
    setSelectedProposed((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  };

  const dismissAddProposals = (section: ExpertSection) => {
    if (!activeRole) return;
    const sectionKey = `${activeRole.id}_${section.id}`;
    setAddProposals((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
    setSelectedProposed((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-slate-500 animate-pulse">読み込み中...</p>;
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⭐ エキスパート要件管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            AIの力を借りてエキスパート要件を改善・追加できます
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/expert"
            target="_blank"
            className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-gray-600"
          >
            👁️ スタッフ画面を確認
          </a>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="text-sm px-4 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "💾 全て保存"}
          </button>
        </div>
      </div>

      <AdminBanner connected={connected} />

      {saveMsg && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            saveMsg.startsWith("💾")
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* ロールタブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {roles.map((role) => {
          const isActive = role.id === activeRoleId;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setActiveRoleId(role.id);
                setOpenSections(new Set());
              }}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm transition-colors ${
                isActive
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{role.icon}</span>
              <span>{role.title}</span>
            </button>
          );
        })}
      </div>

      {activeRole && (
        <div className="space-y-3">
          {/* ロール説明 */}
          <div className="rounded-lg bg-white border-l-4 border-l-teal-500 border p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">{activeRole.icon}</div>
              <div>
                <h2 className="text-base font-bold text-slate-800">{activeRole.title}</h2>
                <p className="text-xs text-slate-600 mt-1">{activeRole.description}</p>
              </div>
            </div>
          </div>

          {/* セクション一覧 */}
          {activeRole.sections.map((section) => {
            const sectionKey = `${activeRole.id}_${section.id}`;
            const isOpen = openSections.has(sectionKey);
            const proposals = addProposals[sectionKey];
            const selected = selectedProposed[sectionKey] ?? new Set<number>();
            const isAddLoading = addLoading.has(sectionKey);

            return (
              <div key={section.id} className="border rounded-lg overflow-hidden bg-white">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleSection(sectionKey)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{section.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {section.items.length}件
                    </span>
                  </div>
                  <span className="text-sm text-slate-400">{isOpen ? "▲" : "▼"}</span>
                </div>

                {isOpen && (
                  <div className="border-t p-4 space-y-3 bg-slate-50/30">
                    {section.items.map((item, idx) => {
                      const sug = improveSuggestions[item.id];
                      const isImproving = improveLoading.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className="border rounded-lg p-3 bg-white space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[11px] px-1.5 py-0.5 rounded border ${LEVEL_BADGE_CLASS[item.level]}`}
                              >
                                {LEVEL_OPTIONS.find((l) => l.value === item.level)?.label}
                              </span>
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAiImprove(item, section)}
                                disabled={isImproving}
                                className="text-xs px-2 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 disabled:opacity-50"
                              >
                                {isImproving ? "✨..." : "✨ AI改善"}
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItem(section.id, idx, -1)}
                                disabled={idx === 0}
                                className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItem(section.id, idx, 1)}
                                disabled={idx === section.items.length - 1}
                                className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-30"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteItem(section.id, item.id)}
                                className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          {/* 編集フォーム */}
                          <div className="space-y-2">
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">タイトル</label>
                              <input
                                value={item.title}
                                onChange={(e) =>
                                  updateItem(section.id, item.id, { title: e.target.value })
                                }
                                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                                placeholder="エキスパート要件のタイトル"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">詳細</label>
                              <textarea
                                value={item.detail}
                                onChange={(e) =>
                                  updateItem(section.id, item.id, { detail: e.target.value })
                                }
                                rows={2}
                                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                                placeholder="具体的な行動・状態の説明"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-medium text-slate-500">レベル</label>
                                <select
                                  value={item.level}
                                  onChange={(e) =>
                                    updateItem(section.id, item.id, {
                                      level: e.target.value as ExpertLevel,
                                    })
                                  }
                                  className="w-full border rounded px-2 py-1 text-sm mt-0.5 bg-white"
                                >
                                  {LEVEL_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-slate-500">カテゴリ</label>
                                <select
                                  value={item.category}
                                  onChange={(e) =>
                                    updateItem(section.id, item.id, {
                                      category: e.target.value as ExpertCategory,
                                    })
                                  }
                                  className="w-full border rounded px-2 py-1 text-sm mt-0.5 bg-white"
                                >
                                  {CATEGORY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* AI改善提案プレビュー */}
                          {sug && (sug.improvedTitle || sug.improvedDetail) && (
                            <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg p-3">
                              <p className="text-xs text-teal-600 mb-1">✨ AI改善提案</p>
                              {sug.improvedTitle && (
                                <p className="text-xs font-medium text-gray-800">
                                  {sug.improvedTitle}
                                </p>
                              )}
                              {sug.improvedDetail && (
                                <p className="text-xs text-gray-600 mt-1">{sug.improvedDetail}</p>
                              )}
                              {sug.suggestion && (
                                <p className="text-[11px] italic text-teal-700 mt-1">
                                  💡 {sug.suggestion}
                                </p>
                              )}
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => applyImprovement(section.id, item.id)}
                                  className="text-xs px-2 py-1 bg-teal-600 text-white rounded"
                                >
                                  適用
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissSuggestion(item.id)}
                                  className="text-xs px-2 py-1 border rounded"
                                >
                                  却下
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 操作ボタン */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => addEmptyItem(section.id)}
                        className="text-sm px-3 py-1.5 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
                      >
                        ＋ 手動で追加
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAiAddItems(section)}
                        disabled={isAddLoading}
                        className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        {isAddLoading ? "AI生成中..." : "➕ AIで項目を追加"}
                      </button>
                    </div>

                    {/* AI追加提案プレビュー */}
                    {proposals && proposals.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-3">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-blue-800">
                            ➕ AI提案の新項目（選択して追加）
                          </p>
                          <button
                            type="button"
                            onClick={() => dismissAddProposals(section)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            閉じる
                          </button>
                        </div>
                        <div className="space-y-1">
                          {proposals.map((d, i) => (
                            <label
                              key={i}
                              className="flex items-start gap-3 p-2 hover:bg-blue-100 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(i)}
                                onChange={() => toggleSelectedProposed(sectionKey, i)}
                                className="mt-1 rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{d.title}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{d.detail}</p>
                                <div className="flex gap-1 mt-1">
                                  <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                    {LEVEL_OPTIONS.find((o) => o.value === d.level)?.label}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                    {CATEGORY_OPTIONS.find((o) => o.value === d.category)?.label}
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => addProposedItems(section)}
                          className="mt-2 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          選択した項目を追加
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
