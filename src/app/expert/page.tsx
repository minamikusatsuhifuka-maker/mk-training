"use client";

import { useEffect, useState, useMemo } from "react";
import {
  EXPERT_ROLES,
  type ExpertRole,
  type ExpertItem,
  type ExpertSection,
  type ExpertLevel,
  type ExpertCategory,
} from "@/data/expertRoles";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const LEVEL_BADGES: Record<ExpertLevel, { label: string; className: string }> = {
  basic: { label: "基礎", className: "bg-green-100 text-green-700 border-green-300" },
  intermediate: {
    label: "中級",
    className: "bg-blue-100 text-blue-700 border-blue-300",
  },
  advanced: {
    label: "上級",
    className: "bg-amber-100 text-amber-800 border-amber-300",
  },
};

const CATEGORY_ICONS: Record<ExpertCategory, { icon: string; label: string }> = {
  knowledge: { icon: "📖", label: "知識" },
  skill: { icon: "⚡", label: "スキル" },
  mindset: { icon: "💡", label: "マインド" },
  action: { icon: "✅", label: "行動" },
};

type Suggestion = {
  improvedTitle?: string;
  improvedDetail?: string;
  suggestion?: string;
};

type NewItemDraft = {
  title: string;
  detail: string;
  level: ExpertLevel;
  category: ExpertCategory;
};

export default function ExpertPage() {
  const [roles, setRoles] = useState<ExpertRole[]>(EXPERT_ROLES);
  const [activeRoleId, setActiveRoleId] = useState<string>(EXPERT_ROLES[0].id);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // AI改善モーダル
  const [improveTarget, setImproveTarget] = useState<{
    item: ExpertItem;
    sectionId: string;
    suggestion: Suggestion | null;
    loading: boolean;
  } | null>(null);

  // AI項目追加モーダル
  const [addTarget, setAddTarget] = useState<{
    sectionId: string;
    sectionTitle: string;
    drafts: NewItemDraft[];
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    // Supabaseから保存済みのカスタマイズを読み込み
    getContent<ExpertRole>(CONTENT_KEYS.expertRoles, EXPERT_ROLES)
      .then((result) => {
        if (result && result.length > 0) {
          setRoles(result);
        }
      })
      .catch(() => {});
  }, []);

  const activeRole = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? roles[0],
    [roles, activeRoleId]
  );

  const persist = async (next: ExpertRole[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.expertRoles, next);
    setSaveMsg(
      ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）"
    );
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // AI改善: 提案取得
  const handleAiImprove = async (
    item: ExpertItem,
    section: ExpertSection,
    role: ExpertRole
  ) => {
    setImproveTarget({ item, sectionId: section.id, suggestion: null, loading: true });
    try {
      const res = await fetch("/api/expert-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          role: role.title,
          section: section.title,
          item,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImproveTarget((prev) =>
          prev ? { ...prev, loading: false, suggestion: { suggestion: data.error ?? "エラー" } } : null
        );
        return;
      }
      setImproveTarget((prev) =>
        prev ? { ...prev, suggestion: data, loading: false } : null
      );
    } catch (e) {
      setImproveTarget((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              suggestion: {
                suggestion: e instanceof Error ? e.message : "ネットワークエラー",
              },
            }
          : null
      );
    }
  };

  // AI改善: 提案を適用
  const applyImprovement = async () => {
    if (!improveTarget || !improveTarget.suggestion) return;
    const { item, sectionId, suggestion } = improveTarget;
    if (!suggestion.improvedTitle && !suggestion.improvedDetail) {
      setImproveTarget(null);
      return;
    }
    const next = roles.map((r) => {
      if (r.id !== activeRoleId) return r;
      return {
        ...r,
        sections: r.sections.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            items: s.items.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    title: suggestion.improvedTitle ?? it.title,
                    detail: suggestion.improvedDetail ?? it.detail,
                  }
                : it
            ),
          };
        }),
      };
    });
    setRoles(next);
    setImproveTarget(null);
    await persist(next);
  };

  // AI項目追加: 提案取得
  const handleAiAddItems = async (section: ExpertSection, role: ExpertRole) => {
    setAddTarget({
      sectionId: section.id,
      sectionTitle: section.title,
      drafts: [],
      loading: true,
    });
    try {
      const res = await fetch("/api/expert-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_items",
          role: role.title,
          section: section.title,
          existingItems: section.items.map((i) => ({
            title: i.title,
            detail: i.detail,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddTarget((prev) => (prev ? { ...prev, loading: false } : null));
        alert(data.error ?? "エラーが発生しました");
        return;
      }
      const newItems: NewItemDraft[] = (data.newItems ?? []).map(
        (n: Partial<NewItemDraft>) => ({
          title: n.title ?? "",
          detail: n.detail ?? "",
          level: (n.level as ExpertLevel) ?? "intermediate",
          category: (n.category as ExpertCategory) ?? "skill",
        })
      );
      setAddTarget((prev) =>
        prev ? { ...prev, drafts: newItems, loading: false } : null
      );
    } catch (e) {
      setAddTarget((prev) => (prev ? { ...prev, loading: false } : null));
      alert(e instanceof Error ? e.message : "ネットワークエラー");
    }
  };

  // AI項目追加: 採用
  const applyNewItems = async () => {
    if (!addTarget) return;
    const { sectionId, drafts } = addTarget;
    const idPrefix = `ai_${Date.now()}_`;
    const next = roles.map((r) => {
      if (r.id !== activeRoleId) return r;
      return {
        ...r,
        sections: r.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const additions: ExpertItem[] = drafts.map((d, i) => ({
            id: `${idPrefix}${i}`,
            title: d.title,
            detail: d.detail,
            level: d.level,
            category: d.category,
          }));
          return { ...s, items: [...s.items, ...additions] };
        }),
      };
    });
    setRoles(next);
    setAddTarget(null);
    await persist(next);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">
          ⭐ エキスパートに求められる働き方
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          各ロールのエキスパートとして成長するために必要な要件・スキル・マインドセット
        </p>
      </div>

      {saveMsg && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            saveMsg.startsWith("保存しました")
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {saveMsg}
        </div>
      )}
      {saving && (
        <div className="text-sm text-muted-foreground animate-pulse">保存中...</div>
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
                  ? "bg-teal text-white border-teal"
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
        <>
          {/* ロール説明 */}
          <Card className="p-5 border-l-4 border-l-teal">
            <div className="flex items-start gap-3">
              <div className="text-3xl">{activeRole.icon}</div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {activeRole.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeRole.description}
                </p>
              </div>
            </div>
          </Card>

          {/* セクション一覧 */}
          <div className="space-y-3">
            {activeRole.sections.map((section) => {
              const sectionKey = `${activeRole.id}_${section.id}`;
              const isOpen = openSections.has(sectionKey);
              return (
                <div
                  key={section.id}
                  className="border rounded-lg overflow-hidden bg-white"
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleSection(sectionKey)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {section.title}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {section.items.length}件
                      </span>
                    </div>
                    <span className="text-sm text-slate-400">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="border-t p-4 space-y-2 bg-slate-50/30">
                      {section.items.map((item) => {
                        const levelBadge = LEVEL_BADGES[item.level];
                        const categoryIcon = CATEGORY_ICONS[item.category];
                        return (
                          <div
                            key={item.id}
                            className="border rounded-lg p-3 bg-white"
                          >
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span
                                    className={`text-[11px] px-1.5 py-0.5 rounded border ${levelBadge.className}`}
                                  >
                                    {levelBadge.label}
                                  </span>
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                    {categoryIcon.icon} {categoryIcon.label}
                                  </span>
                                </div>
                                <p className="font-medium text-sm text-slate-800">
                                  {item.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                  {item.detail}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleAiImprove(item, section, activeRole)
                                }
                                className="text-xs"
                              >
                                ✨ AIで改善
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAiAddItems(section, activeRole)}
                        className="w-full mt-2 text-xs"
                      >
                        ➕ AIで項目を追加
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* AI改善モーダル */}
      <Dialog
        open={!!improveTarget}
        onOpenChange={(open) => !open && setImproveTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>✨ AIによる改善提案</DialogTitle>
          </DialogHeader>
          {improveTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3 border">
                <p className="text-xs text-muted-foreground mb-1">現在のタイトル</p>
                <p className="font-medium">{improveTarget.item.title}</p>
                <p className="text-xs text-muted-foreground mt-2 mb-1">現在の詳細</p>
                <p className="text-xs">{improveTarget.item.detail}</p>
              </div>

              {improveTarget.loading && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  AIが改善案を生成中...
                </p>
              )}

              {!improveTarget.loading && improveTarget.suggestion && (
                <div className="rounded-md border-2 border-teal/40 bg-teal-light/30 p-3 space-y-2">
                  {improveTarget.suggestion.improvedTitle && (
                    <div>
                      <p className="text-xs text-teal font-semibold mb-1">改善後のタイトル</p>
                      <p className="font-medium">
                        {improveTarget.suggestion.improvedTitle}
                      </p>
                    </div>
                  )}
                  {improveTarget.suggestion.improvedDetail && (
                    <div>
                      <p className="text-xs text-teal font-semibold mb-1">改善後の詳細</p>
                      <p className="text-xs">
                        {improveTarget.suggestion.improvedDetail}
                      </p>
                    </div>
                  )}
                  {improveTarget.suggestion.suggestion && (
                    <div>
                      <p className="text-xs text-teal font-semibold mb-1">改善のポイント</p>
                      <p className="text-xs italic text-slate-700">
                        {improveTarget.suggestion.suggestion}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImproveTarget(null)}>
              閉じる
            </Button>
            {improveTarget?.suggestion && !improveTarget.loading &&
              (improveTarget.suggestion.improvedTitle ||
                improveTarget.suggestion.improvedDetail) && (
                <Button onClick={applyImprovement} disabled={saving}>
                  この提案を採用する
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI項目追加モーダル */}
      <Dialog open={!!addTarget} onOpenChange={(open) => !open && setAddTarget(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              ➕ AIで項目を追加 - {addTarget?.sectionTitle}
            </DialogTitle>
          </DialogHeader>
          {addTarget && (
            <div className="space-y-3 text-sm">
              {addTarget.loading && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  AIが追加候補を生成中...
                </p>
              )}

              {!addTarget.loading && addTarget.drafts.length > 0 && (
                <div className="space-y-2">
                  {addTarget.drafts.map((d, i) => {
                    const levelBadge = LEVEL_BADGES[d.level];
                    const categoryIcon = CATEGORY_ICONS[d.category];
                    return (
                      <div
                        key={i}
                        className="border rounded-md p-3 bg-white space-y-1"
                      >
                        <div className="flex gap-1.5 flex-wrap">
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded border ${levelBadge.className}`}
                          >
                            {levelBadge.label}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {categoryIcon.icon} {categoryIcon.label}
                          </span>
                        </div>
                        <p className="font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{d.detail}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {!addTarget.loading && addTarget.drafts.length === 0 && (
                <p className="text-sm text-muted-foreground">提案が取得できませんでした。</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTarget(null)}>
              キャンセル
            </Button>
            {addTarget && addTarget.drafts.length > 0 && !addTarget.loading && (
              <Button onClick={applyNewItems} disabled={saving}>
                {addTarget.drafts.length}件を追加する
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
