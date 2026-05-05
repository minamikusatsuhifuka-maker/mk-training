"use client";

import { useEffect, useState } from "react";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";
import {
  KNOWLEDGE_KEYS,
  MANUAL_CATEGORIES,
  ROLE_LABEL,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_STYLE,
  type Manual,
  type ManualStep,
  type SkillMap,
  type SkillLevel,
  type SkillItem,
  type SkillGrade,
  type OrgKnowledge,
  type OrgKnowledgeType,
  type KnowledgeRole,
} from "@/types/knowledge";

type TopTab = "manuals" | "skillmaps" | "knowledges";

const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: "manuals", label: "📖 マニュアル" },
  { key: "skillmaps", label: "🧠 スキルマップ" },
  { key: "knowledges", label: "🚀 組織ナレッジ" },
];

const KNOWLEDGE_TYPES: OrgKnowledgeType[] = [
  "improvement",
  "success",
  "learning",
  "bestpractice",
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminKnowledgeSystemPage() {
  const [tab, setTab] = useState<TopTab>("manuals");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [manuals, setManuals] = useState<Manual[]>([]);
  const [skillmaps, setSkillmaps] = useState<SkillMap[]>([]);
  const [knowledges, setKnowledges] = useState<OrgKnowledge[]>([]);

  // フィルタ
  const [manualRoleFilter, setManualRoleFilter] = useState<string>("");
  const [manualCatFilter, setManualCatFilter] = useState<string>("");
  const [knowledgeTypeFilter, setKnowledgeTypeFilter] = useState<
    OrgKnowledgeType | "all"
  >("all");
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  // AI生成モーダル
  const [showAiGenerate, setShowAiGenerate] = useState<TopTab | null>(null);
  const [aiGenForm, setAiGenForm] = useState<{
    role: KnowledgeRole;
    customRole: string;
    theme: string;
    category: string;
    notes: string;
  }>({
    role: "multi-office",
    customRole: "",
    theme: "",
    category: "生物学的製剤",
    notes: "",
  });
  const [generating, setGenerating] = useState(false);

  // 編集モーダル
  const [editingManual, setEditingManual] = useState<Manual | null>(null);
  const [editingSkillMap, setEditingSkillMap] = useState<SkillMap | null>(null);

  // AI改善モーダル
  const [improveTarget, setImproveTarget] = useState<{
    type: TopTab;
    item: Manual | SkillMap | OrgKnowledge;
  } | null>(null);
  const [improveInstruction, setImproveInstruction] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      const [m, s, k] = await Promise.all([
        loadPortalItems<Manual>(KNOWLEDGE_KEYS.manuals, []),
        loadPortalItems<SkillMap>(KNOWLEDGE_KEYS.skillmaps, []),
        loadPortalItems<OrgKnowledge>(KNOWLEDGE_KEYS.knowledges, []),
      ]);
      setManuals(m);
      setSkillmaps(s);
      setKnowledges(k);
      setLoading(false);
    };
    fetchAll().catch(() => setLoading(false));
  }, []);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  // ─── AI生成 ───
  const handleAiGenerate = async () => {
    if (!showAiGenerate) return;
    setGenerating(true);
    try {
      const apiType =
        showAiGenerate === "manuals"
          ? "manual"
          : showAiGenerate === "skillmaps"
          ? "skillmap"
          : "knowledge";
      const res = await fetch("/api/knowledge-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: apiType,
          role: aiGenForm.role,
          customRole: aiGenForm.customRole,
          theme: aiGenForm.theme,
          category: aiGenForm.category,
          notes: aiGenForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error ?? "生成に失敗しました");
        return;
      }

      const now = new Date().toISOString();
      if (showAiGenerate === "manuals") {
        const newManual: Manual = {
          id: genId("manual"),
          title: data.title ?? "新規マニュアル",
          role: aiGenForm.role,
          customRole:
            aiGenForm.role === "custom" ? aiGenForm.customRole : undefined,
          category: data.category ?? aiGenForm.category,
          purpose: data.purpose ?? "",
          steps: (data.steps ?? []).map(
            (s: Partial<ManualStep>, i: number): ManualStep => ({
              id: genId("step"),
              order: s.order ?? i + 1,
              title: s.title ?? "",
              description: s.description ?? "",
              checkpoints: s.checkpoints ?? [],
              tips: s.tips,
            })
          ),
          cautions: data.cautions ?? [],
          faq: data.faq ?? [],
          relatedManuals: [],
          isPublished: false,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        const next = [newManual, ...manuals];
        await savePortalItems(KNOWLEDGE_KEYS.manuals, next);
        setManuals(next);
        flash("✨ マニュアルを生成しました（下書き）");
      } else if (showAiGenerate === "skillmaps") {
        const newSkillMap: SkillMap = {
          id: genId("smap"),
          title: data.title ?? "新規スキルマップ",
          role: aiGenForm.role,
          customRole:
            aiGenForm.role === "custom" ? aiGenForm.customRole : undefined,
          description: data.description ?? "",
          levels: (data.levels ?? []).map(
            (lvl: Partial<SkillLevel>): SkillLevel => ({
              id: genId("lvl"),
              name: lvl.name ?? "",
              grade: (lvl.grade as SkillGrade) ?? "G1",
              purpose: lvl.purpose ?? "",
              skills: ((lvl.skills as Partial<SkillItem>[]) ?? []).map(
                (it): SkillItem => ({
                  id: genId("sk"),
                  title: it.title ?? "",
                  description: it.description ?? "",
                  howToLearn: it.howToLearn ?? "",
                  checkCriteria: it.checkCriteria ?? "",
                  isRequired: it.isRequired ?? true,
                })
              ),
              knowledge: ((lvl.knowledge as Partial<SkillItem>[]) ?? []).map(
                (it): SkillItem => ({
                  id: genId("kn"),
                  title: it.title ?? "",
                  description: it.description ?? "",
                  howToLearn: it.howToLearn ?? "",
                  checkCriteria: it.checkCriteria ?? "",
                  isRequired: it.isRequired ?? true,
                })
              ),
              mindset: ((lvl.mindset as Partial<SkillItem>[]) ?? []).map(
                (it): SkillItem => ({
                  id: genId("mi"),
                  title: it.title ?? "",
                  description: it.description ?? "",
                  howToLearn: it.howToLearn ?? "",
                  checkCriteria: it.checkCriteria ?? "",
                  isRequired: it.isRequired ?? true,
                })
              ),
              milestone: lvl.milestone ?? "",
            })
          ),
          isPublished: false,
          createdAt: now,
          updatedAt: now,
        };
        const next = [newSkillMap, ...skillmaps];
        await savePortalItems(KNOWLEDGE_KEYS.skillmaps, next);
        setSkillmaps(next);
        flash("✨ スキルマップを生成しました（下書き）");
      } else if (showAiGenerate === "knowledges") {
        const newKnowledge: OrgKnowledge = {
          id: genId("kg"),
          type: (data.type as OrgKnowledgeType) ?? "bestpractice",
          title: data.title ?? "新規ナレッジ",
          situation: data.situation ?? "",
          content: data.content ?? "",
          impact: data.impact ?? "",
          actionItems: data.actionItems ?? [],
          tags: data.tags ?? [],
          author: "AI生成",
          isAnonymous: false,
          isApproved: false,
          createdAt: now,
        };
        const next = [newKnowledge, ...knowledges];
        await savePortalItems(KNOWLEDGE_KEYS.knowledges, next);
        setKnowledges(next);
        flash("✨ ナレッジを生成しました（承認待ち）");
      }
      setShowAiGenerate(null);
      setAiGenForm({
        role: "multi-office",
        customRole: "",
        theme: "",
        category: "生物学的製剤",
        notes: "",
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setGenerating(false);
    }
  };

  // ─── マニュアル操作 ───
  const updateManuals = async (next: Manual[]) => {
    const ok = await savePortalItems(KNOWLEDGE_KEYS.manuals, next);
    if (ok) setManuals(next);
    return ok;
  };

  const handleManualPublishToggle = async (id: string) => {
    const next = manuals.map((m) =>
      m.id === id
        ? { ...m, isPublished: !m.isPublished, updatedAt: new Date().toISOString() }
        : m
    );
    await updateManuals(next);
    flash("更新しました");
  };

  const handleManualDelete = async (id: string) => {
    if (!confirm("このマニュアルを削除しますか？")) return;
    const next = manuals.filter((m) => m.id !== id);
    await updateManuals(next);
    flash("削除しました");
  };

  const handleManualSave = async (manual: Manual) => {
    const updated: Manual = {
      ...manual,
      updatedAt: new Date().toISOString(),
      version: manual.version + 1,
    };
    const exists = manuals.some((m) => m.id === manual.id);
    const next = exists
      ? manuals.map((m) => (m.id === manual.id ? updated : m))
      : [updated, ...manuals];
    await updateManuals(next);
    setEditingManual(null);
    flash("💾 保存しました");
  };

  // ─── スキルマップ操作 ───
  const updateSkillMaps = async (next: SkillMap[]) => {
    const ok = await savePortalItems(KNOWLEDGE_KEYS.skillmaps, next);
    if (ok) setSkillmaps(next);
    return ok;
  };

  const handleSkillMapPublishToggle = async (id: string) => {
    const next = skillmaps.map((s) =>
      s.id === id ? { ...s, isPublished: !s.isPublished } : s
    );
    await updateSkillMaps(next);
    flash("更新しました");
  };

  const handleSkillMapDelete = async (id: string) => {
    if (!confirm("このスキルマップを削除しますか？")) return;
    const next = skillmaps.filter((s) => s.id !== id);
    await updateSkillMaps(next);
    flash("削除しました");
  };

  const handleSkillMapSave = async (sm: SkillMap) => {
    const updated: SkillMap = { ...sm, updatedAt: new Date().toISOString() };
    const next = skillmaps.map((s) => (s.id === sm.id ? updated : s));
    await updateSkillMaps(next);
    setEditingSkillMap(null);
    flash("💾 保存しました");
  };

  // ─── 組織ナレッジ操作 ───
  const updateKnowledges = async (next: OrgKnowledge[]) => {
    const ok = await savePortalItems(KNOWLEDGE_KEYS.knowledges, next);
    if (ok) setKnowledges(next);
    return ok;
  };

  const approveKnowledge = async (id: string) => {
    const next = knowledges.map((k) =>
      k.id === id
        ? { ...k, isApproved: true, approvedAt: new Date().toISOString() }
        : k
    );
    await updateKnowledges(next);
    flash("✅ 承認・公開しました");
  };

  const deleteKnowledge = async (id: string) => {
    if (!confirm("このナレッジを削除しますか？")) return;
    const next = knowledges.filter((k) => k.id !== id);
    await updateKnowledges(next);
    flash("削除しました");
  };

  // ─── AI改善 ───
  const handleImprove = async () => {
    if (!improveTarget) return;
    setGenerating(true);
    try {
      const apiType =
        improveTarget.type === "manuals"
          ? "manual"
          : improveTarget.type === "skillmaps"
          ? "skillmap"
          : "knowledge";
      const res = await fetch("/api/knowledge-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: apiType,
          content: improveTarget.item,
          instruction: improveInstruction,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error ?? "改善に失敗しました");
        return;
      }

      // 結果をマージしてSupabaseに保存
      if (improveTarget.type === "manuals") {
        const original = improveTarget.item as Manual;
        const merged: Manual = {
          ...original,
          ...data,
          id: original.id,
          steps: (data.steps ?? original.steps).map(
            (s: Partial<ManualStep>, i: number): ManualStep => ({
              id: original.steps[i]?.id ?? genId("step"),
              order: s.order ?? i + 1,
              title: s.title ?? "",
              description: s.description ?? "",
              checkpoints: s.checkpoints ?? [],
              tips: s.tips,
            })
          ),
          updatedAt: new Date().toISOString(),
          version: original.version + 1,
        };
        await updateManuals(
          manuals.map((m) => (m.id === original.id ? merged : m))
        );
      } else if (improveTarget.type === "skillmaps") {
        const original = improveTarget.item as SkillMap;
        const merged: SkillMap = {
          ...original,
          ...data,
          id: original.id,
          updatedAt: new Date().toISOString(),
        };
        await updateSkillMaps(
          skillmaps.map((s) => (s.id === original.id ? merged : s))
        );
      } else if (improveTarget.type === "knowledges") {
        const original = improveTarget.item as OrgKnowledge;
        const merged: OrgKnowledge = { ...original, ...data, id: original.id };
        await updateKnowledges(
          knowledges.map((k) => (k.id === original.id ? merged : k))
        );
      }
      flash("✨ AI改善を適用しました");
      setImproveTarget(null);
      setImproveInstruction("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500 animate-pulse">読み込み中...</p>;
  }

  // ─── フィルタ適用 ───
  const filteredManuals = manuals.filter((m) => {
    if (manualRoleFilter && m.role !== manualRoleFilter) return false;
    if (manualCatFilter && m.category !== manualCatFilter) return false;
    return true;
  });

  const filteredKnowledges = knowledges.filter((k) => {
    if (knowledgeTypeFilter !== "all" && k.type !== knowledgeTypeFilter)
      return false;
    if (showOnlyPending && k.isApproved) return false;
    return true;
  });

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🏛️ 組織知識ベース管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          マニュアル・スキルマップ・組織ナレッジをAIと共に構築・管理します
        </p>
      </div>

      {msg && (
        <div className="rounded-md px-4 py-2 text-sm bg-green-50 text-green-700">
          {msg}
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200 scrollbar-hide">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap shrink-0 px-4 py-2 text-sm border-b-2 transition-colors min-h-[40px] ${
              tab === t.key
                ? "border-teal-500 text-teal-700 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* タブ1: マニュアル */}
      {tab === "manuals" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              <select
                value={manualRoleFilter}
                onChange={(e) => setManualRoleFilter(e.target.value)}
                className="text-sm border rounded-lg px-3 py-2 bg-white min-h-[36px]"
              >
                <option value="">全ロール</option>
                <option value="multi-office">マルチタスク医療事務</option>
                <option value="nurse">看護師</option>
                <option value="all">全スタッフ共通</option>
                <option value="custom">カスタム</option>
              </select>
              <select
                value={manualCatFilter}
                onChange={(e) => setManualCatFilter(e.target.value)}
                className="text-sm border rounded-lg px-3 py-2 bg-white min-h-[36px]"
              >
                <option value="">全カテゴリ</option>
                {MANUAL_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiGenForm({
                    ...aiGenForm,
                    category: "生物学的製剤",
                  });
                  setShowAiGenerate("manuals");
                }}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-sm rounded-xl hover:opacity-90 min-h-[40px]"
              >
                ✨ AIで生成
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredManuals.map((m) => (
              <div
                key={m.id}
                className="bg-white border border-gray-100 rounded-2xl p-4"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full">
                        {ROLE_LABEL[m.role]}
                        {m.role === "custom" && m.customRole
                          ? `: ${m.customRole}`
                          : ""}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {m.category}
                      </span>
                      {m.isPublished ? (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                          公開中
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                          下書き
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        v{m.version}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">{m.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {m.steps.length}ステップ · {m.faq.length}FAQ
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setEditingManual(m)}
                      className="text-xs px-3 py-2 border rounded-lg hover:bg-gray-50 min-h-[36px]"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setImproveTarget({ type: "manuals", item: m })
                      }
                      className="text-xs px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 min-h-[36px]"
                    >
                      ✨ AI改善
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualPublishToggle(m.id)}
                      className={`text-xs px-3 py-2 rounded-lg min-h-[36px] ${
                        m.isPublished
                          ? "bg-gray-100 text-gray-600"
                          : "bg-teal-600 text-white"
                      }`}
                    >
                      {m.isPublished ? "非公開" : "公開"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualDelete(m.id)}
                      className="text-xs px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 min-h-[36px]"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredManuals.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                マニュアルはまだありません。「✨ AIで生成」で作成してください。
              </p>
            )}
          </div>
        </div>
      )}

      {/* タブ2: スキルマップ */}
      {tab === "skillmaps" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setAiGenForm({
                  ...aiGenForm,
                  category: "スキルマップ",
                });
                setShowAiGenerate("skillmaps");
              }}
              className="px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-sm rounded-xl hover:opacity-90 min-h-[40px]"
            >
              ✨ AIで生成
            </button>
          </div>

          <div className="space-y-3">
            {skillmaps.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-gray-100 rounded-2xl p-4"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full">
                        {ROLE_LABEL[s.role]}
                        {s.role === "custom" && s.customRole
                          ? `: ${s.customRole}`
                          : ""}
                      </span>
                      {s.isPublished ? (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                          公開中
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                          下書き
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900">{s.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setEditingSkillMap(s)}
                      className="text-xs px-3 py-2 border rounded-lg hover:bg-gray-50 min-h-[36px]"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setImproveTarget({ type: "skillmaps", item: s })
                      }
                      className="text-xs px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 min-h-[36px]"
                    >
                      ✨ AI改善
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkillMapPublishToggle(s.id)}
                      className={`text-xs px-3 py-2 rounded-lg min-h-[36px] ${
                        s.isPublished
                          ? "bg-gray-100 text-gray-600"
                          : "bg-teal-600 text-white"
                      }`}
                    >
                      {s.isPublished ? "非公開" : "公開"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkillMapDelete(s.id)}
                      className="text-xs px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 min-h-[36px]"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {s.levels.map((lvl) => (
                    <span
                      key={lvl.id}
                      className="text-xs px-2 py-1 bg-gray-50 border rounded-full text-gray-600"
                    >
                      {lvl.grade} {lvl.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {skillmaps.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                スキルマップはまだありません。「✨ AIで生成」で作成してください。
              </p>
            )}
          </div>
        </div>
      )}

      {/* タブ3: 組織ナレッジ */}
      {tab === "knowledges" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={knowledgeTypeFilter}
                onChange={(e) =>
                  setKnowledgeTypeFilter(
                    e.target.value as OrgKnowledgeType | "all"
                  )
                }
                className="text-sm border rounded-lg px-3 py-2 bg-white min-h-[36px]"
              >
                <option value="all">全タイプ</option>
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {KNOWLEDGE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showOnlyPending}
                  onChange={(e) => setShowOnlyPending(e.target.checked)}
                  className="rounded"
                />
                承認待ちのみ
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setAiGenForm({
                  ...aiGenForm,
                  category: "ベストプラクティス",
                });
                setShowAiGenerate("knowledges");
              }}
              className="px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-sm rounded-xl hover:opacity-90 min-h-[40px]"
            >
              ✨ AIで生成
            </button>
          </div>

          <div className="space-y-3">
            {filteredKnowledges.map((k) => (
              <div
                key={k.id}
                className="bg-white border border-gray-100 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          KNOWLEDGE_TYPE_STYLE[k.type]
                        }`}
                      >
                        {KNOWLEDGE_TYPE_LABEL[k.type]}
                      </span>
                      {!k.isApproved && (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                          承認待ち
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm">
                      {k.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {k.author} · {formatDate(k.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!k.isApproved && (
                      <button
                        type="button"
                        onClick={() => approveKnowledge(k.id)}
                        className="text-xs px-3 py-2 bg-teal-600 text-white rounded-lg min-h-[36px]"
                      >
                        承認・公開
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setImproveTarget({ type: "knowledges", item: k })
                      }
                      className="text-xs px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg min-h-[36px]"
                    >
                      ✨ AI改善
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteKnowledge(k.id)}
                      className="text-xs px-3 py-2 border border-red-200 text-red-600 rounded-lg min-h-[36px]"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  <span className="font-medium">📍 場面:</span> {k.situation}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {k.content}
                </p>
                {k.impact && (
                  <p className="text-xs text-purple-700 mt-2">
                    <span className="font-medium">💎 価値:</span> {k.impact}
                  </p>
                )}
                {k.actionItems.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {k.actionItems.map((a, i) => (
                      <li key={i} className="text-xs text-gray-600">
                        ・{a}
                      </li>
                    ))}
                  </ul>
                )}
                {k.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {k.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredKnowledges.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                該当するナレッジはありません
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI生成モーダル */}
      {showAiGenerate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !generating && setShowAiGenerate(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium">
              ✨ AIで{TOP_TABS.find((t) => t.key === showAiGenerate)?.label}を生成
            </h3>

            {showAiGenerate !== "knowledges" && (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    対象ロール
                  </label>
                  <select
                    value={aiGenForm.role}
                    onChange={(e) =>
                      setAiGenForm({
                        ...aiGenForm,
                        role: e.target.value as KnowledgeRole,
                      })
                    }
                    className="w-full border rounded-xl px-3 py-2 text-base bg-white"
                  >
                    <option value="multi-office">マルチタスク医療事務</option>
                    <option value="nurse">看護師</option>
                    <option value="all">全スタッフ共通</option>
                    <option value="custom">カスタム</option>
                  </select>
                </div>
                {aiGenForm.role === "custom" && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      カスタムロール名
                    </label>
                    <input
                      value={aiGenForm.customRole}
                      onChange={(e) =>
                        setAiGenForm({
                          ...aiGenForm,
                          customRole: e.target.value,
                        })
                      }
                      placeholder="例: 受付リーダー"
                      className="w-full border rounded-xl px-3 py-2 text-base"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                テーマ {showAiGenerate === "manuals" && <span className="text-red-500">*</span>}
              </label>
              <input
                value={aiGenForm.theme}
                onChange={(e) =>
                  setAiGenForm({ ...aiGenForm, theme: e.target.value })
                }
                placeholder={
                  showAiGenerate === "manuals"
                    ? "例: デュピクセント自己注射指導の手順"
                    : showAiGenerate === "skillmaps"
                    ? "例: 看護師の生物学的製剤関連スキル"
                    : "例: 待合室の効率改善"
                }
                className="w-full border rounded-xl px-3 py-2 text-base"
              />
            </div>

            {showAiGenerate === "manuals" && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  カテゴリ
                </label>
                <select
                  value={aiGenForm.category}
                  onChange={(e) =>
                    setAiGenForm({ ...aiGenForm, category: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2 text-base bg-white"
                >
                  {MANUAL_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {showAiGenerate === "knowledges" && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  カテゴリ
                </label>
                <select
                  value={aiGenForm.category}
                  onChange={(e) =>
                    setAiGenForm({ ...aiGenForm, category: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2 text-base bg-white"
                >
                  <option>改善提案</option>
                  <option>成功事例</option>
                  <option>失敗から学ぶ</option>
                  <option>ベストプラクティス</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                特記事項（任意）
              </label>
              <textarea
                value={aiGenForm.notes}
                onChange={(e) =>
                  setAiGenForm({ ...aiGenForm, notes: e.target.value })
                }
                rows={2}
                placeholder="特に含めてほしい内容・注意点など"
                className="w-full border rounded-xl px-3 py-2 text-base resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={generating || (showAiGenerate === "manuals" && !aiGenForm.theme.trim())}
                className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-base font-medium disabled:opacity-50"
              >
                {generating ? "⏳ 生成中..." : "✨ 生成する"}
              </button>
              <button
                type="button"
                onClick={() => setShowAiGenerate(null)}
                disabled={generating}
                className="px-4 py-3 border rounded-xl text-base"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI改善モーダル */}
      {improveTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !generating && setImproveTarget(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium">✨ AIで改善</h3>
            <p className="text-sm text-gray-600">
              現在の内容を AI が指示に従って改善します。
            </p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                改善の指示（任意）
              </label>
              <textarea
                value={improveInstruction}
                onChange={(e) => setImproveInstruction(e.target.value)}
                rows={3}
                placeholder="例: もっと初心者向けに、もっと具体的に、注意事項を増やして..."
                className="w-full border rounded-xl px-3 py-2 text-base resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                空欄でも「全体的に実践的・具体的に改善」されます。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImprove}
                disabled={generating}
                className="flex-1 py-3 bg-purple-600 text-white rounded-xl text-base font-medium disabled:opacity-50"
              >
                {generating ? "⏳ 改善中..." : "✨ 改善する"}
              </button>
              <button
                type="button"
                onClick={() => setImproveTarget(null)}
                disabled={generating}
                className="px-4 py-3 border rounded-xl text-base"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* マニュアル編集モーダル */}
      {editingManual && (
        <ManualEditModal
          manual={editingManual}
          onSave={handleManualSave}
          onClose={() => setEditingManual(null)}
        />
      )}

      {/* スキルマップ編集モーダル */}
      {editingSkillMap && (
        <SkillMapEditModal
          skillMap={editingSkillMap}
          onSave={handleSkillMapSave}
          onClose={() => setEditingSkillMap(null)}
        />
      )}
    </div>
  );
}

// ─── マニュアル編集モーダル ───
function ManualEditModal({
  manual,
  onSave,
  onClose,
}: {
  manual: Manual;
  onSave: (m: Manual) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Manual>(manual);

  const updateStep = (id: string, patch: Partial<ManualStep>) => {
    setDraft({
      ...draft,
      steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const addStep = () => {
    setDraft({
      ...draft,
      steps: [
        ...draft.steps,
        {
          id: genId("step"),
          order: draft.steps.length + 1,
          title: "",
          description: "",
          checkpoints: [],
        },
      ],
    });
  };

  const removeStep = (id: string) => {
    setDraft({
      ...draft,
      steps: draft.steps
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i + 1 })),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">📖 マニュアル編集</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左カラム：基本情報 */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                タイトル
              </label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  ロール
                </label>
                <select
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      role: e.target.value as KnowledgeRole,
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-base bg-white"
                >
                  <option value="multi-office">マルチタスク医療事務</option>
                  <option value="nurse">看護師</option>
                  <option value="all">全スタッフ共通</option>
                  <option value="custom">カスタム</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  カテゴリ
                </label>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-base bg-white"
                >
                  {MANUAL_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">目的</label>
              <textarea
                value={draft.purpose}
                onChange={(e) =>
                  setDraft({ ...draft, purpose: e.target.value })
                }
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-base resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                注意事項（1行1件）
              </label>
              <textarea
                value={draft.cautions.join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cautions: e.target.value.split("\n").filter((s) => s.trim()),
                  })
                }
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-base resize-y"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) =>
                  setDraft({ ...draft, isPublished: e.target.checked })
                }
              />
              公開中（スタッフに表示）
            </label>
          </div>

          {/* 右カラム：ステップ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                ステップ（{draft.steps.length}）
              </p>
              <button
                type="button"
                onClick={addStep}
                className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50"
              >
                + 追加
              </button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {draft.steps.map((s, i) => (
                <div
                  key={s.id}
                  className="border rounded-lg p-2 space-y-1 bg-gray-50/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      Step {i + 1}
                    </span>
                    <input
                      value={s.title}
                      onChange={(e) =>
                        updateStep(s.id, { title: e.target.value })
                      }
                      placeholder="タイトル"
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(s.id)}
                      className="text-xs text-red-500"
                    >
                      削除
                    </button>
                  </div>
                  <textarea
                    value={s.description}
                    onChange={(e) =>
                      updateStep(s.id, { description: e.target.value })
                    }
                    rows={2}
                    placeholder="手順の説明"
                    className="w-full border rounded px-2 py-1 text-sm resize-y"
                  />
                  <textarea
                    value={s.checkpoints.join("\n")}
                    onChange={(e) =>
                      updateStep(s.id, {
                        checkpoints: e.target.value
                          .split("\n")
                          .filter((x) => x.trim()),
                      })
                    }
                    rows={2}
                    placeholder="確認ポイント（1行1件）"
                    className="w-full border rounded px-2 py-1 text-sm resize-y"
                  />
                  <input
                    value={s.tips ?? ""}
                    onChange={(e) =>
                      updateStep(s.id, { tips: e.target.value })
                    }
                    placeholder="コツ・ポイント（任意）"
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            FAQ（Q\nA を空行区切り）
          </label>
          <textarea
            value={draft.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}
            onChange={(e) => {
              const blocks = e.target.value.split("\n\n");
              const faq = blocks
                .map((b) => {
                  const qMatch = b.match(/Q[:：]\s*(.+)/);
                  const aMatch = b.match(/A[:：]\s*([\s\S]+)/);
                  return qMatch && aMatch
                    ? { q: qMatch[1].trim(), a: aMatch[1].trim() }
                    : null;
                })
                .filter((x): x is { q: string; a: string } => Boolean(x));
              setDraft({ ...draft, faq });
            }}
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-y font-mono"
            placeholder={"Q: 質問\nA: 回答\n\nQ: 質問2\nA: 回答2"}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-base font-medium"
          >
            💾 保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 border rounded-xl text-base"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── スキルマップ編集モーダル（タイトル・説明のみシンプルに） ───
function SkillMapEditModal({
  skillMap,
  onSave,
  onClose,
}: {
  skillMap: SkillMap;
  onSave: (sm: SkillMap) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SkillMap>(skillMap);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">🧠 スキルマップ編集</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              タイトル
            </label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-base"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">説明</label>
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-base resize-y"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) =>
                setDraft({ ...draft, isPublished: e.target.checked })
              }
            />
            公開中
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              レベル一覧（{draft.levels.length}）
            </p>
            <p className="text-xs text-gray-500">
              内容の細かい編集はAI改善でブラッシュアップしてください。
            </p>
            <div className="space-y-2">
              {draft.levels.map((lvl) => (
                <div
                  key={lvl.id}
                  className="border rounded-lg p-3 bg-gray-50/50"
                >
                  <p className="text-sm font-medium">
                    {lvl.grade}：{lvl.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{lvl.purpose}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    スキル {lvl.skills.length} ・知識 {lvl.knowledge.length} ・マインド {lvl.mindset.length}
                  </p>
                  <p className="text-xs text-teal-700 mt-1">
                    🎯 {lvl.milestone}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="flex-1 py-3 bg-teal-600 text-white rounded-xl text-base font-medium"
          >
            💾 保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 border rounded-xl text-base"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
