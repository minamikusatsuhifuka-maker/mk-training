"use client";

// 👥 スタッフ管理（第2便・指示書 mk_training_staff_sheet_2）
//
// ここが「スタッフ情報の入口」。名簿（タスクの担当者候補と、個人シートへの入口）に加えて、
// それぞれの情報を**どこで直すか**をこの画面から1タップでたどれるようにする。
// - 氏名（名簿）     : この画面で追加・変更（変更はタスクの担当名も付け替えて、記録との関連を保つ）
// - 在籍（退職）     : 👤 アカウント招待の「無効化」（既存の仕組み。この画面は状態を表示して誘導する）
// - 入職日・連絡先   : 📇 スタッフ連絡先（既存の管理画面）
// - 職種             : 本人のプロフィール（本人が決める情報なので、管理者は書き換えない）
// 実在スタッフの情報をこの画面が推測して作ることはない（出すのは登録済みの情報だけ）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMonthDay, formatMonthDayW, presurveyDeadline } from "@/lib/one-on-one-schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadStaffMembers,
  addStaffMemberCanonical,
  renameStaffMemberEverywhere,
  saveStaffMembers,
} from "@/lib/staff-tasks";
import { canonicalRosterName, formatPersonName } from "@/lib/staff-sheet";

type RosterView = {
  name: string;
  link: "open" | "unlinked" | "ambiguous" | "none";
  userId?: string;
  next?: { date: string; time: string; answered: boolean; state: string } | null;
  account?: "active" | "disabled";
  joinedOn?: string;
};

type RosterPayload = {
  members?: RosterView[];
  isAdmin?: boolean;
  unregisteredAccounts?: { userId: string; name: string; account: "active" | "disabled" }[];
  profilelessAccountCount?: number;
};

export default function StaffMembersAdminPage() {
  const [roster, setRoster] = useState<Map<string, RosterView>>(new Map());
  const [extra, setExtra] = useState<Omit<RosterPayload, "members">>({});
  const [members, setMembers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);

  const reloadRoster = useCallback(() => {
    // 404（名簿の管理だけを任された人など）のときはリンク・状態を出さない（従来どおり）
    fetch("/api/growth/roster", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<RosterPayload>) : ({ members: [], noAccess: true } as RosterPayload & { noAccess?: boolean })))
      .then((j) => {
        setRoster(new Map((j.members ?? []).map((m) => [m.name, m])));
        setExtra({
          isAdmin: j.isAdmin,
          unregisteredAccounts: j.unregisteredAccounts,
          profilelessAccountCount: j.profilelessAccountCount,
        });
        setNoAccess((j as { noAccess?: boolean }).noAccess === true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reloadRoster();
  }, [members, reloadRoster]);

  useEffect(() => {
    loadStaffMembers()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const add = async (name?: string) => {
    const raw = (name ?? input).trim();
    if (!raw) return;
    setSaving(true);
    const r = await addStaffMemberCanonical(raw);
    setSaving(false);
    if (!r.ok) {
      setMessage(`追加できません：${r.reason}`);
      return;
    }
    setMessage(r.canonical !== raw ? `「${r.canonical}」の形にそろえて追加しました` : null);
    setMembers((prev) => [...prev, r.canonical]);
    setInput("");
  };

  const remove = async (name: string) => {
    if (!window.confirm(`「${formatPersonName(name)}」を名簿から外しますか？\n（過去のタスク・記録は消えません。担当者候補と、この一覧から外れるだけです）`)) return;
    const next = members.filter((m) => m !== name);
    setMembers(next);
    setSaving(true);
    await saveStaffMembers(next);
    setSaving(false);
  };

  const startEdit = (name: string) => {
    setEditing(name);
    setEditValue(name);
    setMessage(null);
  };

  const commitEdit = async () => {
    if (!editing) return;
    const oldName = editing;
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const r = await renameStaffMemberEverywhere(oldName, newName);
    setSaving(false);
    if (!r.ok) {
      setMessage(`変更できません：${r.reason}`);
      return;
    }
    setEditing(null);
    setMembers((prev) => prev.map((m) => (m === oldName ? r.canonical : m)));
    const moved = r.tasksChanged + r.archiveChanged;
    setMessage(
      moved > 0
        ? `「${r.canonical}」に変更し、タスク${moved}件の担当名も付け替えました（1on1・学びの記録はアカウントで結ばれているため、そのままつながっています）`
        : `「${r.canonical}」に変更しました`
    );
  };

  // 表示の形（スペースなし）とちがう保存名の検出 → そろえるボタン（タスクの付け替え込み）
  const unaligned = members.filter((m) => canonicalRosterName(m) !== m);
  const alignAll = async () => {
    if (!window.confirm(`${unaligned.length}件の名前を、スペースを入れない形にそろえますか？\n（タスクの担当名も同じ名前に付け替えます）`)) return;
    setSaving(true);
    let moved = 0;
    for (const m of unaligned) {
      const r = await renameStaffMemberEverywhere(m, canonicalRosterName(m));
      if (r.ok) {
        moved += r.tasksChanged + r.archiveChanged;
        setMembers((prev) => prev.map((x) => (x === m ? r.canonical : x)));
      } else {
        setMessage(`「${m}」はそろえられませんでした：${r.reason}`);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setMessage(`表記をそろえました（タスク${moved}件の担当名も付け替え済み）`);
  };

  const isAdmin = extra.isAdmin === true;
  const unregistered = extra.unregisteredAccounts ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">👥 スタッフ管理</h1>
        <p className="text-sm text-slate-600 mt-1">
          スタッフの名簿（タスクの担当者候補・個人シートへの入口）です。名前を押すと、その人のスタッフ個人シートが開きます（見られる人の名前だけ）。
        </p>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          スタッフの一覧と各シートを開くのは
          <Link href="/staff-growth" className="text-teal-700 underline underline-offset-2 mx-0.5">📄 スタッフ個人シート</Link>。
          氏名の追加・変更はここで。住所・電話・緊急連絡先・入職日は
          <Link href="/staff-contacts" className="text-teal-700 underline underline-offset-2 mx-0.5">📇 スタッフ連絡先</Link>、
          アカウントの招待・無効化（退職）は
          <Link href="/admin/staff-accounts" className="text-teal-700 underline underline-offset-2 mx-0.5">👤 アカウント招待</Link>、
          職種は本人のプロフィールで登録します（管理者は書き換えません）。
          📇 スタッフ連絡先を開けるのは院長と指名された人だけです（それ以外の人には404が出ます。指名は連絡先画面の「⚙ 設定」から）。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="スタッフ名を入力してEnter / 追加"
          />
          <Button onClick={() => void add()} disabled={!input.trim() || saving}>
            追加
          </Button>
        </div>

        {noAccess && (
          <p className="text-xs rounded-md bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2">
            シートへのリンク・アカウントとの連携状態・入職日・「名簿に未登録のアカウント」は、院長（と担当を任された幹部の範囲）にだけ表示されます。
          </p>
        )}
        {message && (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">{message}</p>
        )}

        {unaligned.length > 0 && (
          <div className="flex items-center justify-between rounded-md bg-sky-50 border border-sky-200 px-3 py-2">
            <span className="text-xs text-sky-900">
              スペース入りの名前が {unaligned.length} 件あります（表示は自動でそろえています）
            </span>
            <Button size="sm" variant="outline" onClick={() => void alignAll()} disabled={saving}>
              保存名もそろえる
            </Button>
          </div>
        )}

        {!loaded ? (
          <p className="text-sm text-slate-600">読み込み中...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-600">
            まだ登録がありません。タスクの担当者欄は自由入力でも使えます。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li
                key={m}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                {editing === m ? (
                  <span className="flex flex-1 items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitEdit();
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      autoFocus
                      className="h-8"
                    />
                    <Button size="sm" onClick={() => void commitEdit()} disabled={saving}>
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      やめる
                    </Button>
                  </span>
                ) : (
                  <>
                    <RosterName name={m} view={roster.get(m)} isAdmin={isAdmin} />
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="text-xs text-slate-500 hover:text-teal-700 min-h-[32px]"
                        title="氏名を変更（タスクの担当名も付け替えます）"
                      >
                        ✏️ 変更
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(m)}
                        className="text-xs text-slate-400 hover:text-red-600 min-h-[32px]"
                      >
                        削除
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {saving && <p className="text-xs text-slate-600">保存中...</p>}
      </div>

      {isAdmin && unregistered.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">🔗 名簿に未登録のアカウント</h2>
          <p className="text-xs text-slate-600">
            アカウント（プロフィール）はあるのに名簿に載っていない人です。一覧に出ないスタッフは、まずここをご確認ください。
            ［名簿に追加］は登録済みの表示名をそのまま使います（推測はしません）。
          </p>
          <ul className="space-y-1.5">
            {unregistered.map((u) => (
              <li key={u.userId} className="flex items-center justify-between rounded-md border border-slate-100 bg-amber-50/50 px-3 py-2">
                <span className="text-sm text-slate-800">
                  {formatPersonName(u.name)}
                  {u.account === "disabled" && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">退職（無効化済み）</span>
                  )}
                </span>
                {u.account !== "disabled" && (
                  <Button size="sm" variant="outline" onClick={() => void add(u.name)} disabled={saving}>
                    名簿に追加
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && (extra.profilelessAccountCount ?? 0) > 0 && (
        <p className="text-xs text-slate-500 px-1">
          このほかに、アカウントはあるがプロフィール（表示名）が未登録の人が {extra.profilelessAccountCount} 人います。
          名前が分からないためここには出せません。
          <Link href="/admin/staff-accounts" className="text-teal-700 underline underline-offset-2 ml-1">👤 アカウント招待</Link>
          のメールアドレス一覧でご確認ください。
        </p>
      )}
    </div>
  );
}

function RosterName({ name, view, isAdmin }: { name: string; view: RosterView | undefined; isAdmin: boolean }) {
  const shown = formatPersonName(name);
  const badges = (
    <>
      {isAdmin && view?.account === "disabled" && (
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600" title="アカウントが無効化されています（退職の扱い）。戻すときは 👤 アカウント招待から">
          退職（無効化）
        </span>
      )}
      {view?.link === "unlinked" && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title="同じ名前のアカウント（プロフィール表示名）が見つかりません。本人のプロフィール名とこの名簿名をそろえると、シートにつながります">
          未連携
        </span>
      )}
      {view?.link === "ambiguous" && (
        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800" title="同じ名前の人が2人以上います。自動では結び付けません（別人の統合はしない決まり）">
          同名あり
        </span>
      )}
    </>
  );

  if (view?.link === "open" && view.userId) {
    const n = view.next;
    return (
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 min-w-0">
          <Link
            href={`/staff-growth/${encodeURIComponent(view.userId)}`}
            className="text-sm font-medium text-teal-800 underline underline-offset-2 min-h-[32px] inline-flex items-center truncate"
            data-roster-open
          >
            {shown}
          </Link>
          {badges}
        </span>
        <span className="text-[11px] text-slate-600">
          {n ? (
            <>
              次の1on1 {formatMonthDayW(n.date)}
              {n.time && ` ${n.time}`}
              {" ・ "}
              事前アンケート{" "}
              {n.answered ? "提出済み" : n.state === "overdue" ? "未回答（締切後）" : `未回答（締切 ${formatMonthDay(presurveyDeadline(n))}）`}
            </>
          ) : (
            "次の1on1 未定"
          )}
          {isAdmin && view.joinedOn && <>{" ・ "}入職 {view.joinedOn.replaceAll("-", "/")}</>}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-sm text-slate-800 min-h-[32px] inline-flex items-center truncate">{shown}</span>
      {badges}
    </span>
  );
}
