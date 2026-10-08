"use client";

// 1on1の事前アンケートの入力欄（指示書197・197-補 → 204 v2で2部構成）
//
// 質問の文言・選択肢・注記・ヒントは content_store の定義（既定は204 v2の2部構成）をそのまま出す。
//
// 【204で足したもの】
// - 各問いの下に**コーポレートブックの一文**をヒントとして出す（出典を小さく添える）
// - カルテと連動する問い（1-1・1-3〜1-6）には「カルテの目標と同じ欄」であることを出す。
//   1-4（年）・1-5（半期）は区切りの日付も出す
// - 1-2 は「3択＋場面を書く」で**どちらも必須**（kind: choice_scene）
// - 前回の答えを参考に小さく出す（1-2のように空欄から答える問い）
//
// 【原則】
// - 注記は「情報として伝える文」として置き、強く迫る言い回しにしない（強制しない）。
// - 自動表示（前回の約束など）が取れないときは、静かに案内だけ出して自由に書けるようにする。

import {
  isAnswered,
  isKarteLinked,
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
  number,
  question,
  answer,
  onChange,
  disabled,
  goals,
  goalsUnavailable,
  previousAnswer,
  referenceAnswer,
  previousPromise,
  karteLabel,
  periodNote,
}: {
  /** 画面に出す番号（例「1-4」） */
  number: string;
  question: PresurveyQuestion;
  answer: PresurveyAnswer;
  onChange: (patch: Partial<PresurveyAnswer>) => void;
  disabled?: boolean;
  /** 197の「目標の確認」で使う自動表示（既定では使わない） */
  goals?: PresurveyGoalHint[] | null;
  goalsUnavailable?: string;
  /** 前回の自分の回答（197の carry_over 用・「コピーして書き換える」が出る） */
  previousAnswer?: { text: string; heldOn: string } | null;
  /** 204: 前回の答えを**参考に**小さく出すだけ（空欄から答える問い。1-2） */
  referenceAnswer?: { text: string; heldOn: string } | null;
  /** 前回の1on1の約束 */
  previousPromise?: PresurveyPromiseHint | null;
  /** 204: カルテと連動する問いの段のラベル（例「年間目標」） */
  karteLabel?: string;
  /** 204: 1-4・1-5 の区切りの日付 */
  periodNote?: string;
}) {
  const answered = isAnswered(question, answer);
  const q = question;
  const linked = isKarteLinked(q);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2" data-presurvey-q={q.id}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 leading-relaxed">
          <span className="text-violet-700 mr-1.5">{number}</span>
          {q.text}
        </p>
        <span
          className={`shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 ${
            q.required ? "bg-rose-100 text-rose-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {q.required ? "必須" : "任意"}
        </span>
      </div>

      {/* 211 B: 「🧭 …」はリードマネジメント上の役割＝**院長向けの設計メモ**なので、
          スタッフの画面には出さない。院長・管理者の画面（質問の編集・回答の閲覧）には残る。
          この部品はスタッフの回答画面からしか使われていない（/one-on-one/presurvey）。 */}

      {/* 204 §2-3: コーポレートブックのヒント（出典を小さく添える） */}
      {q.bookHint && (
        <p
          className="text-xs text-teal-900 bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1.5 leading-relaxed"
          data-presurvey-bookhint
        >
          💡 {q.bookHint}
          {q.bookSource && (
            <span className="block text-[10px] text-teal-700 mt-0.5">（{q.bookSource}）</span>
          )}
        </p>
      )}

      {/* 204 §4: カルテの目標と同じ欄であることを出す */}
      {linked && (
        <p className="text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5" data-presurvey-karte>
          🎯 成長記録の「{karteLabel || "目標"}」と同じ欄です。提出すると、変わったときだけ成長記録の目標が更新されます。
          {periodNote && <span className="block mt-0.5">{periodNote}</span>}
        </p>
      )}

      {/* 添え書き（1-4〜1-6・2-5） */}
      {q.hint && (
        <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
          {q.hint}
        </p>
      )}

      {/* 常時表示の注記（1-7）。情報として伝える文 */}
      {q.note && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
          {q.note}
        </p>
      )}

      {/* 204: 前回の答えを参考に小さく出す（1-2のように毎回まっさらから答える問い） */}
      {referenceAnswer && referenceAnswer.text && (
        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap leading-relaxed" data-presurvey-reference>
          前回（{referenceAnswer.heldOn.replaceAll("-", "/")}）の答え：{referenceAnswer.text}
        </p>
      )}

      {/* 197の「目標の確認」（既定では使わない） */}
      {q.kind === "goal_confirm" && (
        <AutoBox title="🎯 いま登録されているあなたの目標">
          {goals && goals.length > 0 ? (
            <ul className="space-y-0.5">
              {goals.map((g, i) => (
                <li key={`${g.level}-${i}`} className="text-xs text-gray-800">
                  ・{g.level && <span className="text-gray-500">[{g.level}]</span>} {g.title}
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

      {/* 197の「前回の回答を引き継ぐ」（既定では使わない） */}
      {q.kind === "carry_over" && previousAnswer && previousAnswer.text && (
        <AutoBox title={`🔁 前回の回答（${previousAnswer.heldOn.replaceAll("-", "/")}）`}>
          <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
            {previousAnswer.text}
          </p>
          <button
            type="button"
            onClick={() => onChange({ text: previousAnswer.text, unchanged: false, choice: "" })}
            disabled={disabled}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 min-h-[36px]"
          >
            コピーして書き換える
          </button>
        </AutoBox>
      )}

      {/* 2-3: 前回の1on1の約束を自動表示 */}
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
              {q.kind === "choice_scene" ? (
                <span className="ml-1 text-rose-700">（必須）</span>
              ) : (
                !q.required && <span className="ml-1 text-gray-400">（任意）</span>
              )}
            </label>
          )}
          <textarea
            value={answer.text}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={disabled}
            rows={3}
            data-presurvey-input={q.id}
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
