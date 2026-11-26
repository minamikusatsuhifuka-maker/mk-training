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
  loadTasks,
  loadTaskArchive,
} from "@/lib/staff-tasks";
import { canonicalRosterName, formatPersonName } from "@/lib/staff-sheet";

type RosterView = {
  name: string;
  link: "open" | "unlinked" | "ambiguous" | "none";
  userId?: string;
  next?: { date: string; time: string; answered: boolean; state: string } | null;
  account?: "active" | "disabled";
  joinedOn?: string;
  employment?: "active" | "maternity" | "leave" | "left";
  /** 第6便: サーベイの入力様式の状態（管理者だけ返る・点数は含まれない） */
  survey?: {
    policy: "done" | "pending" | "none";
    image: boolean;
    values: boolean;
    details: number;
    aiParsed: boolean;
    updatedOn: string;
  };
};

type RosterPayload = {
  members?: RosterView[];
  isAdmin?: boolean;
  rosterManager?: boolean;
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
          rosterManager: j.rosterManager,
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

  // 第4便: 削除の前に、この名前が担当になっているタスクが無いかを数えて見せる
  // （テスト名の整理で「関連がなければ削除・あれば内容を示す」を1回の操作でできるように）
  const remove = async (name: string) => {
    setSaving(true);
    let related = 0;
    let checked = true;
    try {
      const [tasks, archive] = await Promise.all([loadTasks(), loadTaskArchive()]);
      const hit = (t: { assignee: string; assignees?: string[]; roles?: Record<string, "leader" | "sub"> }) =>
        t.assignee === name || (t.assignees ?? []).includes(name) || (!!t.roles && Object.prototype.hasOwnProperty.call(t.roles, name));
      related = tasks.filter(hit).length + archive.filter(hit).length;
    } catch {
      checked = false;
    }
    setSaving(false);
    const shown = formatPersonName(name);
    const msg = !checked
      ? `「${shown}」を名簿から外しますか？\n（タスクの確認に失敗しました。過去の記録は消えません）`
      : related === 0
        ? `「${shown}」を名簿から外しますか？\n\nこの名前が担当のタスクはありません（アーカイブ含め0件）。シートや記録には影響しません。`
        : `「${shown}」が担当のタスクが ${related} 件あります（アーカイブ含む）。\n名簿から外しても記録は消えず、タスクの担当名もそのまま残ります。\n\n※実在スタッフの名前の直しなら、削除ではなく ✏️変更 を使ってください（記録ごと新しい名前に付け替わります）。\n\n名簿から外しますか？`;
    if (!window.confirm(msg)) return;
    const next = members.filter((m) => m !== name);
    setMembers(next);
    setSaving(true);
    await saveStaffMembers(next);
    setSaving(false);
    setMessage(checked && related > 0 ? `「${shown}」を名簿から外しました（担当タスク${related}件の記録はそのまま残っています）` : `「${shown}」を名簿から外しました`);
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

  const isAdmin = extra.isAdmin === true || extra.rosterManager === true;
  /** 第9便: 👤アカウント招待は管理者専用（委任できない項目）。任された人にはリンクを出さず「院長が行います」と書く（押して404にしない） */
  const realAdmin = extra.isAdmin === true;
  const accountsLink = (cls: string) =>
    realAdmin ? (
      <Link href="/admin/staff-accounts" className={cls}>👤 アカウント招待</Link>
    ) : (
      <span className="text-slate-600">👤 アカウント招待（院長が行います）</span>
    );
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
          {accountsLink("text-teal-700 underline underline-offset-2 mx-0.5")}、
          職種は本人のプロフィールで登録します（管理者は書き換えません）。
          📇 スタッフ連絡先を開けるのは院長と指名された人だけです（それ以外の人には404が出ます。指名は連絡先画面の「⚙ 設定」から）。
          各行の「📇 連絡先」を押すと、その人の連絡先をすぐ開けます（まだ無ければ氏名入りの登録フォームが開きます）。
          🧭 はサーベイの入力様式の状態です（そろっている形＝結果画像あり・詳細15項目入力・公開範囲の統一。点数や回答の中身はこの画面に出ません）。
        </p>
        {/* 第8便①: バッジの凡例（折りたたみ・いつでも確認できる） */}
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">
            ❓ 名前の横のバッジ・下線の意味（押すと開きます）
          </summary>
          <ul className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
            <li><strong>名前に下線</strong> … 押すとその人の📄個人シートが開く（開けるのは院長・担当の幹部・管理者だけ。下線が無くても連携切れではない）</li>
            <li><strong>未連携</strong> … 同じ氏名のプロフィールが見つからない（本人がプロフィール未登録か、表記ゆれ。✏️変更でそろえると消える）</li>
            <li><strong>同名あり</strong> … 同じ読みの氏名が2人以上いて自動で結び付けない（別人の統合はしない決まり）</li>
            <li><strong>🤱 産休・育休／🌿 休職／退職</strong> … 📇連絡先の「在籍区分」。ログインの可否とは別</li>
            <li><strong>🔒 ログイン停止中</strong> … アカウントの無効化（👤アカウント招待で変更）</li>
            <li><strong>🧭 …</strong> … サーベイの状態（未回答／⏳公開の本人確認待ち／✅統一済み＋画像・15項目の不足。管理者だけに表示）</li>
            <li><strong>次の1on1 …</strong> … 🗓1on1の日程に登録された直近の予定と、事前アンケートの提出状況</li>
          </ul>
        </details>
      </div>

      {/* 第7便: どこを押すか迷わないための「やることナビ」（順番つき・この画面が入口） */}
      {isAdmin && (
        <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-4 space-y-2" data-staff-nav-guide>
          <p className="text-sm font-bold text-slate-800">📌 新しいスタッフを迎えるとき（上から順に）</p>
          <ol className="space-y-1.5 text-xs text-slate-700">
            <li>
              ①{" "}
              {accountsLink("text-teal-700 underline underline-offset-2 font-medium")}{" "}
              でメールアドレスを招待する（ログインできるようにする）
            </li>
            <li>② 本人が初回ログインで氏名・職種を登録する → この画面の「🔗 名簿に未登録のアカウント」に名前が出る</li>
            <li>③ その枠の［名簿に追加］を押す（タスクの担当候補・個人シートの入口になる）</li>
            <li>④ 下の一覧でその人の行の「📇 連絡先」→ ✏️編集 →「住所・電話・緊急連絡先・入職日・在籍区分」を入れて 💾保存</li>
            <li>⑤ サーベイ・写真は本人がスマホで登録 → 進み具合はこの一覧の 🧭 に出る</li>
          </ol>
          <p className="text-[11px] text-slate-600">
            アカウントより先に名前だけ載せたいときは、下の入力欄に氏名を入れて「追加」。
            氏名の直しは行の「✏️ 変更」（過去のタスク担当名も自動で付け替え）。ログイン停止（退職）は 👤 アカウント招待で。
          </p>
        </div>
      )}

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

        {/* 第7便: 「名前が押せない＝連携していない」と見えないように、リンクが出る条件を明示 */}
        {extra.rosterManager === true && extra.isAdmin !== true && (
          <p className="text-xs rounded-md bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2">
            この画面では名簿の管理（追加・✏️変更・削除・📇連絡先・未登録アカウント）ができます。
            名前を押して個人シートを開けるのは、個人シートを見られる人（院長・担当の幹部・管理者）だけ、
            🧭サーベイ状態は管理者だけに出ます（リンクが無くても連携が切れているわけではありません）。
          </p>
        )}
        {noAccess && (
          <p className="text-xs rounded-md bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2">
            連携状態・在籍区分・入職日・「名簿に未登録のアカウント」は、院長と「スタッフ管理」を任された人にだけ表示されます（シートへのリンクは、個人シートを見られる人だけ）。
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
                      {isAdmin && (
                        <Link
                          href={`/staff-contacts?q=${encodeURIComponent(formatPersonName(m))}`}
                          className="text-xs text-slate-500 hover:text-teal-700 min-h-[32px] inline-flex items-center"
                          title="住所・電話・緊急連絡先・入職日・在籍区分の登録・編集（📇 スタッフ連絡先で、この人を開きます。開けるのは院長と指名された人だけ）"
                        >
                          📇 連絡先
                        </Link>
                      )}
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
          {accountsLink("text-teal-700 underline underline-offset-2 ml-1")}
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
      {/* 第5便: 在籍区分（📇スタッフ連絡先で編集）とログインの可否（👤アカウント招待の無効化）は別々に表示 */}
      {isAdmin && view?.employment === "maternity" && (
        <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] text-pink-800" title="在籍のまま。📇 スタッフ連絡先の「在籍区分」で変更できます">
          🤱 産休・育休
        </span>
      )}
      {isAdmin && view?.employment === "leave" && (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800" title="在籍のまま。📇 スタッフ連絡先の「在籍区分」で変更できます">
          🌿 休職
        </span>
      )}
      {isAdmin && view?.employment === "left" && (
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600" title="📇 スタッフ連絡先の「在籍区分」より">
          退職
        </span>
      )}
      {isAdmin && view?.account === "disabled" && (
        <span className="rounded bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600" title="ログインできない状態です（在籍区分とは別）。戻すときは 👤 アカウント招待から">
          🔒 ログイン停止中
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
        {view.survey && <SurveyCheck s={view.survey} />}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-slate-800 min-h-[32px] inline-flex items-center truncate">{shown}</span>
        {badges}
      </span>
      {view?.survey && <SurveyCheck s={view.survey} />}
    </span>
  );
}

/** 第6便: サーベイの入力様式の状態（管理者だけ・点数は出さない）。
 *  そろっている形＝結果画像あり・詳細15項目入力・公開範囲の統一。
 *  足りないものは「本人にお願いすること」の形で出す（本人入力の決まりのまま・管理者は書き換えない）。 */
function SurveyCheck({ s }: { s: NonNullable<RosterView["survey"]> }) {
  if (s.policy === "none") {
    return (
      <span className="text-[11px] text-slate-500" data-survey-check="none">
        🧭 サーベイ未回答 ・ お願い: プロフィール画面で回答（画像アップロードまたは手入力）
      </span>
    );
  }
  const asks: string[] = [];
  if (!s.image) asks.push("結果画像（またはPDF）のアップロード");
  if (s.details < 15) asks.push(`詳細15項目の入力（いま ${s.details}/15）`);
  if (!s.values && s.details === 0) asks.push("5欲求の値の入力");
  if (s.policy === "pending") asks.push("公開範囲の確認（✅ この公開範囲にする → 💾 保存）");
  return (
    <span className="text-[11px]" data-survey-check={s.policy}>
      🧭{" "}
      {s.policy === "done" ? (
        <span className="text-teal-700">公開統一済み</span>
      ) : (
        <span className="text-amber-700">公開の本人確認待ち</span>
      )}
      {s.updatedOn && <span className="text-slate-500">・回答 {s.updatedOn.replaceAll("-", "/")}</span>}
      {asks.length > 0 ? (
        <span className="text-amber-800">・お願い: {asks.join("、")}</span>
      ) : (
        <span className="text-slate-500">・そろっています（画像・15項目）</span>
      )}
    </span>
  );
}
