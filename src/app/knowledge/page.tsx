"use client";

import { useEffect, useMemo, useState } from "react";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";
import {
  KNOWLEDGE_KEYS,
  MANUAL_CATEGORIES,
  ROLE_LABEL,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_STYLE,
  TODO_TIMING_LABEL,
  TODO_TIMING_STYLE,
  type Manual,
  type SkillMap,
  type SkillItem,
  type OrgKnowledge,
  type OrgKnowledgeType,
} from "@/types/knowledge";

type StaffTab = "manuals" | "skillmaps" | "knowledges";

const TABS: { key: StaffTab; label: string }[] = [
  { key: "manuals", label: "📖 マニュアル" },
  { key: "skillmaps", label: "🧠 スキルマップ" },
  { key: "knowledges", label: "🚀 組織ナレッジ" },
];

const SKILL_PROGRESS_KEY = "mk_knowledge_skill_progress";

function loadProgress(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SKILL_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(p: Record<string, boolean>) {
  try {
    localStorage.setItem(SKILL_PROGRESS_KEY, JSON.stringify(p));
  } catch {}
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function KnowledgePage() {
  const [tab, setTab] = useState<StaffTab>("manuals");

  const [manuals, setManuals] = useState<Manual[]>([]);
  const [skillmaps, setSkillmaps] = useState<SkillMap[]>([]);
  const [knowledges, setKnowledges] = useState<OrgKnowledge[]>([]);

  // マニュアル
  const [manualSearch, setManualSearch] = useState("");
  const [manualRole, setManualRole] = useState<string>("");
  const [manualCat, setManualCat] = useState<string>("");
  const [openManualId, setOpenManualId] = useState<string | null>(null);

  // スキルマップ
  const [activeSkillMapId, setActiveSkillMapId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  // 組織ナレッジ
  const [knowledgeFilter, setKnowledgeFilter] = useState<
    OrgKnowledgeType | "all"
  >("all");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitForm, setSubmitForm] = useState<{
    type: OrgKnowledgeType;
    title: string;
    situation: string;
    content: string;
    impact: string;
    tags: string;
    author: string;
    isAnonymous: boolean;
  }>({
    type: "improvement",
    title: "",
    situation: "",
    content: "",
    impact: "",
    tags: "",
    author: "",
    isAnonymous: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const [m, s, k] = await Promise.all([
        loadPortalItems<Manual>(KNOWLEDGE_KEYS.manuals, []),
        loadPortalItems<SkillMap>(KNOWLEDGE_KEYS.skillmaps, []),
        loadPortalItems<OrgKnowledge>(KNOWLEDGE_KEYS.knowledges, []),
      ]);
      setManuals(m.filter((x) => x.isPublished));
      const publishedSkillMaps = s.filter((x) => x.isPublished);
      setSkillmaps(publishedSkillMaps);
      setKnowledges(k.filter((x) => x.isApproved));
      if (publishedSkillMaps.length > 0) {
        setActiveSkillMapId(publishedSkillMaps[0].id);
      }
      setProgress(loadProgress());
    };
    fetchAll().catch(() => {});
  }, []);

  // ─── マニュアルフィルタ ───
  const filteredManuals = useMemo(() => {
    return manuals.filter((m) => {
      if (manualRole && m.role !== manualRole) return false;
      if (manualCat && m.category !== manualCat) return false;
      if (manualSearch) {
        const q = manualSearch.toLowerCase();
        const hay = `${m.title} ${m.purpose} ${m.steps
          .map((s) => `${s.title} ${s.description}`)
          .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [manuals, manualRole, manualCat, manualSearch]);

  // ─── スキルマップ進捗 ───
  const toggleProgress = (itemId: string) => {
    const next = { ...progress, [itemId]: !progress[itemId] };
    setProgress(next);
    saveProgress(next);
  };

  const activeSkillMap = skillmaps.find((s) => s.id === activeSkillMapId);
  const skillMapStats = useMemo(() => {
    if (!activeSkillMap) return { total: 0, done: 0 };
    let total = 0;
    let done = 0;
    activeSkillMap.levels.forEach((lvl) => {
      [...lvl.skills, ...lvl.knowledge, ...lvl.mindset].forEach((it) => {
        total++;
        if (progress[it.id]) done++;
      });
    });
    return { total, done };
  }, [activeSkillMap, progress]);

  // ─── ナレッジ投稿 ───
  const handleSubmitKnowledge = async () => {
    if (!submitForm.title.trim() || !submitForm.content.trim()) {
      alert("タイトルと内容は必須です");
      return;
    }
    setSubmitting(true);
    try {
      const all = await loadPortalItems<OrgKnowledge>(
        KNOWLEDGE_KEYS.knowledges,
        []
      );
      const newItem: OrgKnowledge = {
        id: `kg_${Date.now()}`,
        type: submitForm.type,
        title: submitForm.title.trim(),
        situation: submitForm.situation.trim(),
        content: submitForm.content.trim(),
        impact: submitForm.impact.trim(),
        actionItems: [],
        tags: submitForm.tags
          .split(/[,、 　]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        author: submitForm.isAnonymous
          ? "匿名"
          : submitForm.author.trim() || "匿名",
        isAnonymous: submitForm.isAnonymous,
        isApproved: false,
        createdAt: new Date().toISOString(),
      };
      const ok = await savePortalItems(KNOWLEDGE_KEYS.knowledges, [
        newItem,
        ...all,
      ]);
      if (!ok) {
        alert("送信に失敗しました");
        return;
      }
      alert(
        "✅ 投稿を受け付けました。管理者の承認後、組織ナレッジとして公開されます。"
      );
      setShowSubmitForm(false);
      setSubmitForm({
        type: "improvement",
        title: "",
        situation: "",
        content: "",
        impact: "",
        tags: "",
        author: "",
        isAnonymous: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredKnowledges = useMemo(() => {
    if (knowledgeFilter === "all") return knowledges;
    return knowledges.filter((k) => k.type === knowledgeFilter);
  }, [knowledges, knowledgeFilter]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">
          🏛️ 組織知識ベース
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          仕事マニュアル・スキルマップ・組織ナレッジを確認できます
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide border-b border-gray-200">
        {TABS.map((t) => (
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
        <div className="space-y-3">
          <input
            value={manualSearch}
            onChange={(e) => setManualSearch(e.target.value)}
            placeholder="🔍 マニュアル検索（タイトル・手順から）"
            className="w-full border rounded-xl px-4 py-3 text-base"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={manualRole}
              onChange={(e) => setManualRole(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-white min-h-[36px]"
            >
              <option value="">全ロール</option>
              <option value="multi-office">マルチタスク医療事務</option>
              <option value="nurse">看護師</option>
              <option value="all">全スタッフ共通</option>
              <option value="custom">カスタム</option>
            </select>
            <select
              value={manualCat}
              onChange={(e) => setManualCat(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-white min-h-[36px]"
            >
              <option value="">全カテゴリ</option>
              {MANUAL_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          {filteredManuals.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">
              公開されているマニュアルはまだありません
            </p>
          )}

          {filteredManuals.map((m) => {
            const isOpen = openManualId === m.id;
            return (
              <div
                key={m.id}
                className="bg-white border border-gray-100 rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenManualId(isOpen ? null : m.id)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
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
                    <span className="text-xs text-gray-400 ml-auto">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{m.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {m.steps.length}ステップ · {m.faq.length}FAQ
                  </p>
                </button>

                {isOpen && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4">
                    <div className="p-3 bg-teal-50 rounded-xl">
                      <p className="text-xs font-medium text-teal-700 mb-1">
                        📎 このマニュアルの目的
                      </p>
                      <p className="text-sm text-teal-900 leading-relaxed">
                        {m.purpose}
                      </p>
                    </div>

                    {(m.todoItems ?? []).length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-xl">
                        <p className="text-xs font-medium text-blue-700 mb-2">
                          ✅ Todoリスト
                        </p>
                        <div className="space-y-1.5">
                          {(m.todoItems ?? []).map((todo) => (
                            <label
                              key={todo.id}
                              className="flex items-center gap-2 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                className="rounded text-blue-600 flex-shrink-0"
                              />
                              <span className="text-sm text-blue-900 flex-1 leading-snug">
                                {todo.text}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${TODO_TIMING_STYLE[todo.timing]}`}
                              >
                                {TODO_TIMING_LABEL[todo.timing]}
                              </span>
                              {todo.priority === "high" && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full flex-shrink-0">
                                  必須
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {m.steps.map((step) => (
                        <div
                          key={step.id}
                          className="border border-gray-100 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
                              {step.order}
                            </span>
                            <h4 className="font-medium text-sm text-gray-900">
                              {step.title}
                            </h4>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed ml-9">
                            {step.description}
                          </p>
                          {step.checkpoints.length > 0 && (
                            <div className="ml-9 mt-2 space-y-1">
                              {step.checkpoints.map((cp, i) => (
                                <label
                                  key={i}
                                  className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    className="rounded mt-0.5"
                                  />
                                  <span>{cp}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {step.tips && (
                            <p className="ml-9 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                              💡 {step.tips}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {m.cautions.length > 0 && (
                      <div className="p-3 bg-red-50 rounded-xl">
                        <p className="text-xs font-medium text-red-700 mb-2">
                          ⚠️ 注意事項
                        </p>
                        <ul className="space-y-1">
                          {m.cautions.map((c, i) => (
                            <li key={i} className="text-sm text-red-800">
                              ・{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {m.faq.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-600">
                          ❓ よくある質問
                        </p>
                        {m.faq.map((item, i) => (
                          <div
                            key={i}
                            className="border border-gray-100 rounded-xl p-3"
                          >
                            <p className="text-sm font-medium text-gray-800">
                              Q: {item.q}
                            </p>
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                              A: {item.a}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* タブ2: スキルマップ */}
      {tab === "skillmaps" && (
        <div className="space-y-3">
          {skillmaps.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">
              公開されているスキルマップはまだありません
            </p>
          )}

          {skillmaps.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              {skillmaps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSkillMapId(s.id)}
                  className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-sm border min-h-[36px] ${
                    activeSkillMapId === s.id
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {activeSkillMap && (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {activeSkillMap.description}
                </p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>習得進捗</span>
                    <span>
                      {skillMapStats.done} / {skillMapStats.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-500 h-2 rounded-full transition-all"
                      style={{
                        width:
                          skillMapStats.total > 0
                            ? `${(skillMapStats.done / skillMapStats.total) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {activeSkillMap.levels.map((lvl) => (
                <div
                  key={lvl.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-medium">
                        {lvl.grade}
                      </span>
                      <h3 className="font-medium text-gray-900">{lvl.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                      {lvl.purpose}
                    </p>
                  </div>

                  <SkillSection
                    title="⚡ スキル"
                    items={lvl.skills}
                    progress={progress}
                    onToggle={toggleProgress}
                  />
                  <SkillSection
                    title="📖 知識"
                    items={lvl.knowledge}
                    progress={progress}
                    onToggle={toggleProgress}
                  />
                  <SkillSection
                    title="💡 マインドセット"
                    items={lvl.mindset}
                    progress={progress}
                    onToggle={toggleProgress}
                  />

                  {lvl.milestone && (
                    <div className="p-3 bg-teal-50 rounded-xl">
                      <p className="text-xs font-medium text-teal-700 mb-1">
                        🎯 達成基準
                      </p>
                      <p className="text-sm text-teal-900 leading-relaxed">
                        {lvl.milestone}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* タブ3: 組織ナレッジ */}
      {tab === "knowledges" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              <button
                type="button"
                onClick={() => setKnowledgeFilter("all")}
                className={`whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-full text-sm min-h-[36px] ${
                  knowledgeFilter === "all"
                    ? "bg-teal-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                すべて
              </button>
              {(
                [
                  "improvement",
                  "success",
                  "learning",
                  "bestpractice",
                ] as OrgKnowledgeType[]
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setKnowledgeFilter(t)}
                  className={`whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-full text-sm min-h-[36px] ${
                    knowledgeFilter === t
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {KNOWLEDGE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowSubmitForm(true)}
              className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full min-h-[40px]"
            >
              + 投稿する
            </button>
          </div>

          {filteredKnowledges.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">
              該当するナレッジはまだありません
            </p>
          )}

          {filteredKnowledges.map((k) => (
            <div
              key={k.id}
              className="bg-white border border-gray-100 rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    KNOWLEDGE_TYPE_STYLE[k.type]
                  }`}
                >
                  {KNOWLEDGE_TYPE_LABEL[k.type]}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {k.author} · {formatDate(k.createdAt)}
                </span>
              </div>
              <h3 className="font-medium text-gray-900 mb-1">{k.title}</h3>
              {k.situation && (
                <p className="text-xs text-gray-500 mb-2">
                  📍 {k.situation}
                </p>
              )}
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {k.content}
              </p>
              {k.impact && (
                <p className="text-xs text-purple-700 mt-2 leading-relaxed">
                  💎 {k.impact}
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

          {/* 投稿フォーム */}
          {showSubmitForm && (
            <div
              className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => !submitting && setShowSubmitForm(false)}
            >
              <div
                className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-medium text-gray-900">
                    🚀 組織ナレッジを投稿
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowSubmitForm(false)}
                    className="text-gray-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  気づき・改善案・成功事例などを投稿してください。管理者承認後に公開されます。
                </p>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    タイプ
                  </label>
                  <select
                    value={submitForm.type}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        type: e.target.value as OrgKnowledgeType,
                      })
                    }
                    className="w-full border rounded-xl px-3 py-2 text-base bg-white"
                  >
                    <option value="improvement">💡 改善提案</option>
                    <option value="success">✅ 成功事例</option>
                    <option value="learning">📚 失敗から学ぶ</option>
                    <option value="bestpractice">⭐ ベストプラクティス</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    タイトル <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={submitForm.title}
                    onChange={(e) =>
                      setSubmitForm({ ...submitForm, title: e.target.value })
                    }
                    placeholder="ひと言で伝わるタイトル"
                    className="w-full border rounded-xl px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    場面・状況
                  </label>
                  <input
                    value={submitForm.situation}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        situation: e.target.value,
                      })
                    }
                    placeholder="どんな場面で気づいた？"
                    className="w-full border rounded-xl px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    内容・気づき <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={submitForm.content}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        content: e.target.value,
                      })
                    }
                    rows={4}
                    className="w-full border rounded-xl px-3 py-2 text-base resize-y"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    組織への影響・価値
                  </label>
                  <textarea
                    value={submitForm.impact}
                    onChange={(e) =>
                      setSubmitForm({ ...submitForm, impact: e.target.value })
                    }
                    rows={2}
                    className="w-full border rounded-xl px-3 py-2 text-base resize-y"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    タグ（カンマ区切り）
                  </label>
                  <input
                    value={submitForm.tags}
                    onChange={(e) =>
                      setSubmitForm({ ...submitForm, tags: e.target.value })
                    }
                    placeholder="例: 受付, クレーム対応"
                    className="w-full border rounded-xl px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={submitForm.isAnonymous}
                      onChange={(e) =>
                        setSubmitForm({
                          ...submitForm,
                          isAnonymous: e.target.checked,
                        })
                      }
                    />
                    匿名で投稿する
                  </label>
                </div>
                {!submitForm.isAnonymous && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      お名前
                    </label>
                    <input
                      value={submitForm.author}
                      onChange={(e) =>
                        setSubmitForm({
                          ...submitForm,
                          author: e.target.value,
                        })
                      }
                      placeholder="〇〇"
                      className="w-full border rounded-xl px-3 py-2 text-base"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSubmitKnowledge}
                  disabled={submitting}
                  className="w-full py-3 bg-teal-600 text-white rounded-xl text-base font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {submitting ? "送信中..." : "🚀 投稿する"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillSection({
  title,
  items,
  progress,
  onToggle,
}: {
  title: string;
  items: SkillItem[];
  progress: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-2">{title}</p>
      <div className="space-y-2">
        {items.map((it) => (
          <label
            key={it.id}
            className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={!!progress[it.id]}
              onChange={() => onToggle(it.id)}
              className="rounded mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">
                {it.title}
                {!it.isRequired && (
                  <span className="ml-2 text-xs text-gray-400">（推奨）</span>
                )}
              </p>
              {it.description && (
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  {it.description}
                </p>
              )}
              {it.checkCriteria && (
                <p className="text-xs text-teal-700 mt-1">
                  ✓ {it.checkCriteria}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
