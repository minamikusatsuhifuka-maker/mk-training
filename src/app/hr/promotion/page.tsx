"use client";

// ステージ移行ページ（指示書116・[PAGE:promotion] の転記のみ）
// 情報量が多いため、移行ごとの折りたたみ＋職種（看護師／医療事務）切替タブで構造化
// （内容の増減は不可・構造化のみ可）。ハッシュ #g2-g3 等で該当移行を開いて遷移する。

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrPortalFooter,
  HrBackLink,
  renderInlineBold,
  useScrollToHash,
} from "@/components/HrPortalParts";
import {
  HR_PROMOTION_INTRO,
  HR_TRANSITIONS,
  HR_PROMOTION_NOTES,
  HR_PROMOTION_NOTES_TITLE,
  type HrTransition,
} from "@/data/hr-portal";

type Role = "nurse" | "clerk";

const ROLE_TABS: { value: Role; label: string }[] = [
  { value: "nurse", label: "看護師" },
  { value: "clerk", label: "マルチタスク医療事務" },
];

function SubHeading({ text }: { text: string }) {
  return <h3 className="text-xs font-bold text-gray-700">{text}</h3>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li
          key={i}
          className="text-sm text-gray-700 leading-relaxed flex gap-2"
        >
          <span className="text-teal-500 shrink-0 mt-0.5">・</span>
          <span className="min-w-0">{renderInlineBold(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function TransitionCard({
  transition,
  role,
  open,
  onToggle,
}: {
  transition: HrTransition;
  role: Role;
  open: boolean;
  onToggle: () => void;
}) {
  const t = transition;
  return (
    <section
      id={t.id}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden scroll-mt-4"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 md:px-5 py-4 text-left hover:bg-teal-50/30 transition-colors"
      >
        <span className="text-sm font-bold text-gray-800">{t.title}</span>
        <span className="text-gray-400 text-xs shrink-0">
          {open ? "▲ たたむ" : "▼ ひらく"}
        </span>
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          <div className="space-y-2">
            <SubHeading text={t.meaningTitle} />
            {t.meaning.map((p, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">
                {renderInlineBold(p)}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <SubHeading text={t.learningTitle} />
            <BulletList items={t.learning} />
          </div>
          <div className="space-y-2">
            <SubHeading text={t.axesTitle} />
            <BulletList items={t.axes} />
          </div>
          <div className="space-y-2">
            <SubHeading text={t.attainmentTitle} />
            {t.attainment
              .filter((g) => g.role === "common" || g.role === role)
              .map((g) => (
                <div key={g.heading} className="space-y-1.5">
                  <p className="text-xs font-semibold text-teal-800 bg-teal-50/60 rounded-lg px-3 py-1.5">
                    {g.heading}
                  </p>
                  <BulletList items={g.items} />
                </div>
              ))}
          </div>
          <div className="space-y-2">
            <SubHeading text={t.sharingTitle} />
            <p className="text-sm text-gray-700 leading-relaxed">
              {renderInlineBold(t.sharing)}
            </p>
          </div>
          <div className="space-y-2">
            <SubHeading text={t.perspectiveTitle} />
            <p className="text-sm text-gray-700 leading-relaxed">
              {renderInlineBold(t.perspective)}
            </p>
          </div>
          <div className="space-y-2">
            <SubHeading text={t.questionsTitle} />
            <BulletList items={t.questions} />
          </div>
        </div>
      )}
    </section>
  );
}

function PromotionBody() {
  const [role, setRole] = useState<Role>("nurse");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // ハッシュで指定された移行を開いてスクロール（#g2-g3 等）
  useScrollToHash((hash) => {
    if (HR_TRANSITIONS.some((t) => t.id === hash)) {
      setOpenIds((prev) => new Set(prev).add(hash));
    }
  });

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <HrBackLink />

      {/* 冒頭注記・凡例（そのまま表示） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-2">
        {HR_PROMOTION_INTRO.map((p, i) => (
          <p key={i} className="text-xs text-gray-600 leading-relaxed">
            {renderInlineBold(p)}
          </p>
        ))}
      </div>

      {/* 職種切替タブ（到達状態の職種別グループにのみ作用・共通グループは常時表示） */}
      <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm w-fit bg-white">
        {ROLE_TABS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRole(r.value)}
            className={
              role === r.value
                ? "px-4 py-2 bg-teal-600 text-white font-medium"
                : "px-4 py-2 text-gray-600 hover:bg-gray-50"
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      {HR_TRANSITIONS.map((t) => (
        <TransitionCard
          key={t.id}
          transition={t}
          role={role}
          open={openIds.has(t.id)}
          onToggle={() => toggle(t.id)}
        />
      ))}

      {/* 運用メモ */}
      <section
        id="notes"
        className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-3 scroll-mt-4"
      >
        <h2 className="text-sm font-bold text-gray-800">
          {HR_PROMOTION_NOTES_TITLE}
        </h2>
        <BulletList items={HR_PROMOTION_NOTES} />
      </section>

      <HrPortalFooter />
    </div>
  );
}

export default function HrPromotionPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="🪜 ステージ移行"
        description="必須の学び・到達項目・対話の問い"
      />
      <FeatureGate feature="hr_portal">
        <PromotionBody />
      </FeatureGate>
    </div>
  );
}
