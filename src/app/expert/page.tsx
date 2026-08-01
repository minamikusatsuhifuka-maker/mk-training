"use client";

import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/lib/use-nav";
import {
  EXPERT_ROLES,
  type ExpertRole,
  type ExpertLevel,
  type ExpertCategory,
} from "@/data/expertRoles";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { Card } from "@/components/ui/card";

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

// ロール毎のタブ色（active状態）
const ROLE_TAB_ACTIVE: Record<string, string> = {
  teal: "bg-teal-600 text-white border-teal-600",
  pink: "bg-pink-500 text-white border-pink-500",
  green: "bg-green-600 text-white border-green-600",
  blue: "bg-blue-600 text-white border-blue-600",
  orange: "bg-orange-500 text-white border-orange-500",
};

// マルチタスク医療事務のサブ役割セクションのスタイル
const MULTI_SECTION_STYLE: Record<string, string> = {
  "as-office":
    "bg-teal-50 border-l-4 border-teal-400 text-teal-800",
  "as-clerk":
    "bg-blue-50 border-l-4 border-blue-400 text-blue-800",
  "as-counselor":
    "bg-orange-50 border-l-4 border-orange-400 text-orange-800",
};

// 旧形式（5ロール構成）かどうか判定
function isOldFormat(roles: ExpertRole[]): boolean {
  return (
    roles.some(
      (r) => r.id === "medical-office" || r.id === "clerk" || r.id === "counselor"
    ) || roles.length !== 3
  );
}

export default function ExpertPage() {
  const pageTitle = usePageTitle("/expert", "⭐ エキスパートに求められる働き方");
  const [roles, setRoles] = useState<ExpertRole[]>(EXPERT_ROLES);
  const [activeRoleId, setActiveRoleId] = useState<string>(EXPERT_ROLES[0].id);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Supabaseから保存済みの内容を読み込み
    getContent<ExpertRole>(CONTENT_KEYS.expertRoles, EXPERT_ROLES)
      .then(async (result) => {
        if (!result || result.length === 0) {
          setRoles(EXPERT_ROLES);
          return;
        }
        // 旧形式（5ロール構成）の場合は新3ロール構成で上書き
        if (isOldFormat(result)) {
          await saveContent(CONTENT_KEYS.expertRoles, EXPERT_ROLES);
          setRoles(EXPERT_ROLES);
          return;
        }
        setRoles(result);
      })
      .catch(() => {
        setRoles(EXPERT_ROLES);
      });
  }, []);

  const activeRole = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? roles[0],
    [roles, activeRoleId]
  );

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-w-[1536px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">
          {pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          各ロールのエキスパートとして成長するために必要な要件・スキル・マインドセット
        </p>
      </div>

      {/* ロールタブ（3ロール・モバイル横スクロール） */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {roles.map((role) => {
          const isActive = role.id === activeRoleId;
          const activeClass =
            ROLE_TAB_ACTIVE[role.color] ?? ROLE_TAB_ACTIVE.teal;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setActiveRoleId(role.id);
                setOpenSections(new Set());
              }}
              className={`whitespace-nowrap shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-sm transition-colors min-h-[40px] ${
                isActive
                  ? activeClass
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
              const isMultiSection =
                activeRole.id === "multi-office" &&
                MULTI_SECTION_STYLE[section.id];
              const headerClass = isMultiSection
                ? `flex items-center gap-2 px-4 py-4 rounded-t-lg cursor-pointer min-h-[56px] ${MULTI_SECTION_STYLE[section.id]}`
                : "flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-slate-50 min-h-[56px]";
              return (
                <div
                  key={section.id}
                  className="border rounded-lg overflow-hidden bg-white"
                >
                  <div
                    className={headerClass}
                    onClick={() => toggleSection(sectionKey)}
                  >
                    {isMultiSection ? (
                      <>
                        <span className="font-semibold flex-1">
                          {section.title}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-slate-700">
                          {section.items.length}件
                        </span>
                        <span className="text-sm">
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
