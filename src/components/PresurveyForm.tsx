"use client";

// 1on1の事前アンケートの入力欄（指示書197・197-補）
//
// 並びは選択理論の面談の流れ（願望 → 行動 → 自己評価 → 計画・約束）。
// 質問の文言・選択肢・注記は content_store の定義（既定は197-補の9問）をそのまま出す。
//
// 【原則】
// - 注記は「情報として伝える文」として置き、強く迫る言い回しにしない（強制しない）。
// - 自動表示（本人の目標・前回の回答・前回の約束）が取れないときは、静かに案内だけ出して
//   自由に書けるようにする（取れないことで回答できなくならないようにする）。

import {
  isAnswered,
  type PresurveyAnswer,
  type PresurveyQuestion,
} from "@/lib/one-on-one-presurvey";

export type PresurveyGoalHint = {
  /** 段階のラベル（年間目標 など） */
  level: string;
  title: string;
};

export type PresurveyPromiseHint = {
  text: string;
  heldOn: string;
  partnerName: string;
};

function ChoiceRow({
  choices,
  value,
  onSelect,
  disabled,
}: {
  choices: string[];
  value: string;
  onSelect: (choice: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onSelect(value === c ? "" : c)}
          disabled={disabled}
          aria-pressed={value === c}
          className={`text-xs px-3 py-2 rounded-full border min-h-[40px] disabled:opacity-40 ${
            value === c
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function AutoBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
      <p className="text-[11px] font-medium text-gray-600">{title}</p>
      {children}
    </div>
  );
}

export function PresurveyQuestionBlock({
  index,
  question,
  answer,
  onChange,
  disabled,
  goals,
  goalsUnavailable,
  previousAnswer,
  previousPromise,
}: {
  index: number;
  question: PresurveyQuestion;
  answer: PresurveyAnswer;
  onChange: (patch: Partial<PresurveyAnswer>) => void;
  disabled?: boolean;
  /** 質問3: 本人の目標（自動表示）。null は未取得 */
  goals?: PresurveyGoalHint[] | null;
  /** 目標を自動表示できない事情（フラグOFF・未登録など） */
  goalsUnavailable?: string;
  /** 質問4: 前回の自分の回答 */
  previousAnswer?: { text: string; heldOn: string } | null;
  /** 質問6: 前回の1on1の約束 */
  previousPromise?: PresurveyPromiseHint | null;
}) {
  const answered = isAnswered(question, answer);
  const q = question;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 leading-relaxed">
          <span className="text-violet-700 mr-1.5">{index}.</span>
          {q.text}
        </p>
        <span
          className={`shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 ${
            q.required
              ? "bg-rose-100 text-rose-800"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {q.required ? "必須" : "任意"}
        </span>
      </div>

      {q.role && (
        <p className="text-[11px] text-gray-500">🧭 {q.role}</p>
      )}

      {/* 補足表示（質問4の「もし制約がなかったら…」） */}
      {q.hint && (
        <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
          {q.hint}
        </p>
      )}

      {/* 常時表示の注記（質問5）。情報として伝える文 */}
      {q.note && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
          {q.note}
        </p>
      )}

      {/* 質問3: 本人の目標を自動表示 */}
      {q.kind === "goal_confirm" && (
        <AutoBox title="🎯 いま登録されているあなたの目標">
          {goals && goals.length > 0 ? (
            <ul className="space-y-0.5">
              {goals.map((g, i) => (
                <li key={`${g.level}-${i}`} className="text-xs text-gray-800">
                  ・{g.level && <span className="text-gray-500">[{g.level}]</span>}{" "}
                  {g.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-600">
              {goalsUnavailable || "登録された目標は見つかりませんでした。下に書いてください。"}
            </p>
          )}
        </AutoBox>
      )}

      {/* 質問4: 前回の自分の回答 */}
      {q.kind === "carry_over" && previousAnswer && previousAnswer.text && (
        <AutoBox
          title={`🔁 前回の回答（${previousAnswer.heldOn.replaceAll("-", "/")}）`}
        >
          <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
            {previousAnswer.text}
          </p>
          <button
            type="button"
            onClick={() =>
              onChange({ text: previousAnswer.text, unchanged: false, choice: "" })
            }
            disabled={disabled}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 min-h-[36px]"
          >
            コピーして書き換える
          </button>
        </AutoBox>
      )}

      {/* 質問6: 前回の1on1の約束を自動表示 */}
      {q.kind === "promise_check" && (
        <AutoBox title="🔗 前回の1on1の約束">
          {previousPromise && previousPromise.text ? (
            <>
              <p className="text-xs text-gray-500">
                {previousPromise.heldOn.replaceAll("-", "/")}
                {previousPromise.partnerName && `・${previousPromise.partnerName}さんと`}
              </p>
              <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                {previousPromise.text}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-600">
              前回の約束は見つかりませんでした（初めての1on1かもしれません）。
            </p>
          )}
        </AutoBox>
      )}

      {/* 選択肢 */}
      {q.choices.length > 0 && (
        <ChoiceRow
          choices={q.choices}
          value={answer.choice}
          onSelect={(c) =>
            onChange({
              choice: c,
              // 「変わりない」を選んだら引き継ぎの印を立てる（記述が空でも答えになる）
              unchanged: c === "変わりない",
            })
          }
          disabled={disabled}
        />
      )}

      {/* 記述欄。選択肢だけの質問（followUpLabel が空）では出さない */}
      {(q.kind === "text" || q.followUpLabel) && (
        <div className="space-y-1">
          {q.followUpLabel && (
            <label className="text-xs text-gray-600 block">
              {q.followUpLabel}
              {!q.required && <span className="ml-1 text-gray-400">（任意）</span>}
            </label>
          )}
          <textarea
            value={answer.text}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={disabled}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
          />
        </div>
      )}

      {q.required && !answered && (
        <p className="text-[11px] text-rose-700">まだ答えていません</p>
      )}
    </div>
  );
}
