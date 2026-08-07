"use client";

// 🤝 1on1ノート（指示書112・機能ID one_on_one）
// - 各等級ペアの月1回の1on1を記録し、伴走の連続性を作る。評価の場ではなく伴走の時間。
// - データは private_store のみ（認証付きAPI経由・anon直読みなし）。
//   閲覧は本人＋ペア相手＋管理者のみ（判定はサーバー側）。記録者のみ編集・削除可。
// - リアクションなし・実施回数の集計/ランキングなし（指示書の禁止事項）。
// - 一覧は listInvolved（自分が記録した回＋相手として参加した回）を実施日降順で表示。

import { useState, useEffect, useCallback, useMemo } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  listInvolved,
  upsertRecord,
  deleteRecord,
  PrivateStoreError,
  type PrivateRecord,
} from "@/lib/private-store-client";
import {
  emptyOneOnOneData,
  normalizeOneOnOneData,
  normalizeHeldOnYmd,
  genOneOnOneKey,
  sortOneOnOne,
  ONE_ON_ONE_INTRO,
  ONE_ON_ONE_EMPTY,
  PARTNER_NOTE,
  ONE_ON_ONE_SECTIONS,
  type OneOnOneData,
} from "@/lib/one-on-one";
import { jstTodayYmd } from "@/lib/library";
import {
  JitsuChecklist,
  JitsuCheckSummary,
} from "@/components/JitsuChecklist";
import { RwdepcForm, RwdepcGuide } from "@/components/RwdepcForm";
import {
  EMPTY_RWDEPC,
  RWDEPC_STEPS,
  hasRwdepcBody,
  type RwdepcData,
} from "@/lib/rwdepc";
import type { OneOnOneMode } from "@/lib/one-on-one";
import type { JitsuGroupKey } from "@/lib/jitsu-checklist";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  loadProfilesIndex,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

type SectionDraft = { theme: string; kizuki: string; nextStep: string };

const EMPTY_SECTIONS: SectionDraft = { theme: "", kizuki: "", nextStep: "" };

function OneOnOnePageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [records, setRecords] = useState<PrivateRecord[]>([]);
  const [myId, setMyId] = useState("");
  const [myName, setMyName] = useState("");
  const [profiles, setProfiles] = useState<StaffProfileIndexEntry[]>([]);
  const [error, setError] = useState("");

  // 新規フォーム
  const [heldOnDraft, setHeldOnDraft] = useState("");
  const [partnerIdDraft, setPartnerIdDraft] = useState("");
  const [sectionsDraft, setSectionsDraft] = useState<SectionDraft>(EMPTY_SECTIONS);
  // 152: 7つの実チェック（この回の記録として保存）
  const [jitsuDraft, setJitsuDraft] = useState<string[]>([]);
  // 153: 記録形式（クイックメモ / RWDEPC対話）と RWDEPC の5欄
  const [modeDraft, setModeDraft] = useState<OneOnOneMode>("quick");
  const [rwdepcDraft, setRwdepcDraft] = useState<RwdepcData>(EMPTY_RWDEPC);
  const [jitsuOpenGroup, setJitsuOpenGroup] = useState<JitsuGroupKey | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  // 編集（記録者本人のみ）
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editHeldOn, setEditHeldOn] = useState("");
  const [editPartnerId, setEditPartnerId] = useState("");
  const [editSections, setEditSections] = useState<SectionDraft>(EMPTY_SECTIONS);
  const [editJitsu, setEditJitsu] = useState<string[]>([]);
  const [editMode, setEditMode] = useState<OneOnOneMode>("quick");
  const [editRwdepc, setEditRwdepc] = useState<RwdepcData>(EMPTY_RWDEPC);
  const [editJitsuOpenGroup, setEditJitsuOpenGroup] =
    useState<JitsuGroupKey | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // 展開中の記録
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const today = jstTodayYmd();

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState("unauthenticated");
        return;
      }
      setMyId(user.id);
      const idx = await loadProfilesIndex().catch(() => []);
      setProfiles(idx);
      setMyName(idx.find((p) => p.userId === user.id)?.name?.trim() || "名前未設定");
      const list = await listInvolved("one_on_one");
      setRecords(list);
      setState("ready");
    } catch (e) {
      if (e instanceof PrivateStoreError && e.kind === "unauthenticated") {
        setState("unauthenticated");
        return;
      }
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 相手候補: 自分以外のプロフィール登録者（userId 必須のため名簿のみの人は含めない）
  const partnerCandidates = useMemo(
    () => profiles.filter((p) => p.userId && p.userId !== myId && p.name?.trim()),
    [profiles, myId]
  );
  const nameOf = useCallback(
    (userId: string, fallback: string) =>
      profiles.find((p) => p.userId === userId)?.name?.trim() || fallback,
    [profiles]
  );

  const sorted = useMemo(() => sortOneOnOne(records), [records]);

  // 153: 同じ相手の過去のRWDEPC回を新しい順で返す（③前回の約束・④Wの引き継ぎに使う）
  const pastRwdepcFor = useCallback(
    (partnerId: string, heldOn: string, excludeKey?: string) => {
      if (!partnerId) return [];
      return records
        .map((r) => ({ r, d: normalizeOneOnOneData(r.data) }))
        .filter(
          ({ r, d }) =>
            r.recordKey !== excludeKey &&
            d.mode === "rwdepc" &&
            d.participantIds.includes(partnerId) &&
            d.heldOn &&
            (!heldOn || d.heldOn < heldOn)
        )
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn))
        .map(({ d }) => d);
    },
    [records]
  );

  // 152: 「前回の1on1」のチェックを引く（同じ相手の、指定日より前で最も新しい回）。
  // 見つからなければ null＝比較しない（初回は ✨new を出さない）。
  const previousJitsuFor = useCallback(
    (partnerId: string, heldOn: string, excludeKey?: string): string[] | null => {
      if (!partnerId) return null;
      const past = records
        .map((r) => ({ r, d: normalizeOneOnOneData(r.data) }))
        .filter(
          ({ r, d }) =>
            r.recordKey !== excludeKey &&
            d.participantIds.includes(partnerId) &&
            d.heldOn &&
            (!heldOn || d.heldOn < heldOn)
        )
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
      return past.length > 0 ? past[0].d.jitsuChecks : null;
    },
    [records]
  );

  const submit = async () => {
    const heldOn = normalizeHeldOnYmd(heldOnDraft);
    if (!heldOn) {
      setError("実施日を入力してください");
      return;
    }
    if (!partnerIdDraft) {
      setError("相手を選択してください");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const data: OneOnOneData = {
        mode: modeDraft,
        heldOn,
        participantIds: [partnerIdDraft],
        partnerName: nameOf(partnerIdDraft, "名前未設定"),
        authorName: myName,
        sections: { ...sectionsDraft },
        jitsuChecks: jitsuDraft,
        rwdepc: rwdepcDraft,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await upsertRecord("one_on_one", genOneOnOneKey(), data);
      setRecords((prev) => [saved, ...prev]);
      setHeldOnDraft("");
      setPartnerIdDraft("");
      setSectionsDraft(EMPTY_SECTIONS);
      setJitsuDraft([]);
      setRwdepcDraft(EMPTY_RWDEPC);
      setJitsuOpenGroup(null);
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "記録に失敗しました。もう一度お試しください。"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (record: PrivateRecord) => {
    const d = normalizeOneOnOneData(record.data);
    setEditingKey(record.recordKey);
    setEditHeldOn(d.heldOn);
    setEditPartnerId(d.participantIds[0] ?? "");
    setEditSections({ ...d.sections });
    setEditJitsu(d.jitsuChecks);
    setEditMode(d.mode);
    setEditRwdepc(d.rwdepc);
    setEditJitsuOpenGroup(null);
  };

  const saveEdit = async (record: PrivateRecord) => {
    const heldOn = normalizeHeldOnYmd(editHeldOn);
    if (!heldOn || !editPartnerId || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const d = normalizeOneOnOneData(record.data);
      const next: OneOnOneData = {
        ...d,
        heldOn,
        participantIds: [editPartnerId],
        partnerName: nameOf(editPartnerId, d.partnerName || "名前未設定"),
        authorName: myName,
        sections: { ...editSections },
        jitsuChecks: editJitsu,
        mode: editMode,
        rwdepc: editRwdepc,
        updatedAt: new Date().toISOString(),
      };
      const saved = await upsertRecord("one_on_one", record.recordKey, next);
      setRecords((prev) =>
        prev.map((r) => (r.recordKey === record.recordKey ? saved : r))
      );
      setEditingKey(null);
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "保存に失敗しました。もう一度お試しください。"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // 物理削除（110の原則: 機微データは「消したら消える」）
  const remove = async (record: PrivateRecord) => {
    if (busyKey) return;
    if (!confirm("この記録を削除しますか？（削除すると元に戻せません）")) return;
    setBusyKey(record.recordKey);
    setError("");
    try {
      await deleteRecord("one_on_one", record.recordKey);
      setRecords((prev) =>
        prev.filter((r) => r.recordKey !== record.recordKey)
      );
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "削除に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusyKey(null);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (state === "loading") {
    return (
      <p className="text-sm text-gray-500 py-16 text-center animate-pulse">
        読み込んでいます…
      </p>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-gray-800">
          1on1ノートの利用にはログインが必要です。
        </p>
        <a
          href="/login"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700"
        >
          ログインする
        </a>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3 inline-block">
          {error || "読み込みに失敗しました"}
        </p>
        <p className="text-xs text-gray-500">
          ページを再読み込みしても直らない場合は院長にお知らせください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 指示書112の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-violet-50/60 border border-violet-100 rounded-xl px-4 py-3">
        {ONE_ON_ONE_INTRO}
      </p>

      {/* 記録フォーム */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-gray-600">
            実施日
            <input
              type="date"
              value={heldOnDraft}
              max={today}
              onChange={(e) => setHeldOnDraft(e.target.value)}
              className="block border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            相手
            <select
              value={partnerIdDraft}
              onChange={(e) => setPartnerIdDraft(e.target.value)}
              className="block border border-gray-200 rounded-xl px-3 py-1.5 text-sm min-w-[160px]"
            >
              <option value="">選択してください</option>
              {partnerCandidates.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-gray-500">{PARTNER_NOTE}</p>

        {/* 153: 記録の形式を選ぶ（既存の自由形式＝クイックメモとして温存） */}
        <div className="flex items-center gap-2">
          {(
            [
              ["quick", "📝 クイックメモ"],
              ["rwdepc", "🔄 RWDEPC対話"],
            ] as const
          ).map(([m, label]) => (
            <button
              type="button"
              key={m}
              onClick={() => setModeDraft(m)}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border min-h-[44px] ${
                modeDraft === m
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {modeDraft === "quick" ? (
          ONE_ON_ONE_SECTIONS.map((sec) => (
            <div key={sec.key} className="space-y-1">
              <label className="text-sm font-medium text-gray-800 block">
                {sec.label}
              </label>
              <textarea
                value={sectionsDraft[sec.key]}
                onChange={(e) =>
                  setSectionsDraft((prev) => ({
                    ...prev,
                    [sec.key]: e.target.value,
                  }))
                }
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
              />
            </div>
          ))
        ) : (
          (() => {
            const past = pastRwdepcFor(partnerIdDraft, heldOnDraft);
            const prev = past[0] ?? null;
            const withW = past.filter((d) => d.rwdepc.w.trim());
            return (
              <RwdepcForm
                value={rwdepcDraft}
                onChange={setRwdepcDraft}
                disabled={submitting}
                previousPromise={prev?.rwdepc.c.trim() || null}
                previousPromiseDate={prev?.heldOn ?? null}
                onOpenJikko={() => setJitsuOpenGroup("jikko")}
                previousW={withW[0]?.rwdepc.w.trim() || null}
                previousWDate={withW[0]?.heldOn ?? null}
                wHistory={withW.map((d) => ({ heldOn: d.heldOn, w: d.rwdepc.w }))}
              />
            );
          })()
        )}
        {/* 152: 7つの実チェック（この回の記録として保存される） */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-800 block">
            🌾 7つの実チェック
          </label>
          <JitsuChecklist
            checked={jitsuDraft}
            onChange={setJitsuDraft}
            previousChecked={previousJitsuFor(partnerIdDraft, heldOnDraft)}
            disabled={submitting}
            openGroup={jitsuOpenGroup}
            onOpenGroupChange={setJitsuOpenGroup}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-500">
            {myName} として記録します（記録の編集・削除はあなただけができます）
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!heldOnDraft || !partnerIdDraft || submitting}
            className="text-sm px-4 py-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "記録中…" : "🤝 記録する"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* 一覧（実施日降順・自分が記録した回＋相手として参加した回） */}
      {/* 153-⑤ 問いかけ集（読むだけモード） */}
      <RwdepcGuide />

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          {ONE_ON_ONE_EMPTY}
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((record) => {
            const d = normalizeOneOnOneData(record.data);
            const isAuthor = record.ownerId === myId;
            const authorName = nameOf(record.ownerId, d.authorName || "名前未設定");
            const partnerName = d.participantIds[0]
              ? nameOf(d.participantIds[0], d.partnerName || "名前未設定")
              : d.partnerName || "名前未設定";
            const isExpanded = expanded.has(record.recordKey);
            const editing = editingKey === record.recordKey;
            const hasBody =
              d.mode === "rwdepc"
                ? hasRwdepcBody(d.rwdepc)
                : !!(d.sections.theme || d.sections.kizuki || d.sections.nextStep);
            return (
              <div
                key={record.recordKey}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium bg-violet-100 text-violet-800 rounded-full px-2 py-0.5">
                      📅 {d.heldOn.replaceAll("-", "/")}
                    </span>
                    {d.mode === "rwdepc" && (
                      <span className="text-[10px] font-medium bg-teal-100 text-teal-800 rounded-full px-2 py-0.5">
                        🔄 RWDEPC
                      </span>
                    )}
                    <span className="text-sm text-gray-800">
                      記録: <span className="font-medium">{authorName}さん</span>
                      {" → "}相手: <span className="font-medium">{partnerName}さん</span>
                    </span>
                    {!isAuthor && (
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                        {authorName}さんの記録
                      </span>
                    )}
                  </div>
                  {isAuthor && !editing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(record)}
                        disabled={busyKey === record.recordKey}
                        className="text-xs px-2 py-1 text-gray-500 hover:text-red-600 disabled:opacity-50"
                      >
                        🗑️ 削除
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 flex-wrap">
                      <input
                        type="date"
                        value={editHeldOn}
                        max={today}
                        onChange={(e) => setEditHeldOn(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
                      />
                      <select
                        value={editPartnerId}
                        onChange={(e) => setEditPartnerId(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm min-w-[160px]"
                      >
                        <option value="">選択してください</option>
                        {partnerCandidates.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {editMode === "quick" ? (
                      ONE_ON_ONE_SECTIONS.map((sec) => (
                        <div key={sec.key} className="space-y-1">
                          <label className="text-sm font-medium text-gray-800 block">
                            {sec.label}
                          </label>
                          <textarea
                            value={editSections[sec.key]}
                            onChange={(e) =>
                              setEditSections((prev) => ({
                                ...prev,
                                [sec.key]: e.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
                          />
                        </div>
                      ))
                    ) : (
                      (() => {
                        const past = pastRwdepcFor(
                          editPartnerId,
                          editHeldOn,
                          record.recordKey
                        );
                        const prev = past[0] ?? null;
                        const withW = past.filter((x) => x.rwdepc.w.trim());
                        return (
                          <RwdepcForm
                            value={editRwdepc}
                            onChange={setEditRwdepc}
                            disabled={savingEdit}
                            previousPromise={prev?.rwdepc.c.trim() || null}
                            previousPromiseDate={prev?.heldOn ?? null}
                            onOpenJikko={() => setEditJitsuOpenGroup("jikko")}
                            previousW={withW[0]?.rwdepc.w.trim() || null}
                            previousWDate={withW[0]?.heldOn ?? null}
                            wHistory={withW.map((x) => ({
                              heldOn: x.heldOn,
                              w: x.rwdepc.w,
                            }))}
                          />
                        );
                      })()
                    )}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-800 block">
                        🌾 7つの実チェック
                      </label>
                      <JitsuChecklist
                        checked={editJitsu}
                        onChange={setEditJitsu}
                        previousChecked={previousJitsuFor(
                          editPartnerId,
                          editHeldOn,
                          record.recordKey
                        )}
                        disabled={savingEdit}
                        openGroup={editJitsuOpenGroup}
                        onOpenGroupChange={setEditJitsuOpenGroup}
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        disabled={savingEdit}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(record)}
                        disabled={savingEdit || !editHeldOn || !editPartnerId}
                        className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-50"
                      >
                        {savingEdit ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 152: この回でチェックされた実（読み取り専用の要約） */}
                    <JitsuCheckSummary checks={d.jitsuChecks} />
                    {hasBody && (
                    <div className="space-y-2">
                      {d.mode === "rwdepc"
                        ? (isExpanded
                            ? RWDEPC_STEPS
                            : RWDEPC_STEPS.slice(0, 1)
                          ).map((step) =>
                            d.rwdepc[step.key] ? (
                              <div key={step.key}>
                                <p className="text-xs text-gray-500">
                                  <span className="text-violet-700 font-medium">
                                    {step.mark}
                                  </span>
                                  ｜{step.label}
                                </p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                  {d.rwdepc[step.key]}
                                </p>
                              </div>
                            ) : null
                          )
                        : (isExpanded
                            ? ONE_ON_ONE_SECTIONS
                            : ONE_ON_ONE_SECTIONS.slice(0, 1)
                          ).map((sec) =>
                            d.sections[sec.key] ? (
                              <div key={sec.key}>
                                <p className="text-xs text-gray-500">{sec.label}</p>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                  {d.sections[sec.key]}
                                </p>
                              </div>
                            ) : null
                          )}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(record.recordKey)}
                        className="text-xs text-violet-700 underline hover:opacity-70"
                      >
                        {isExpanded ? "たたむ" : "すべて表示"}
                      </button>
                    </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OneOnOnePage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/one-on-one"
        title="🤝 1on1ノート"
        description="伴走の対話を記録する場"
      />
      <FeatureGate feature="one_on_one">
        <OneOnOnePageBody />
      </FeatureGate>
    </div>
  );
}
