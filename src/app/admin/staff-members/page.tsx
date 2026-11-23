"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMonthDay, formatMonthDayW, presurveyDeadline } from "@/lib/one-on-one-schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadStaffMembers, saveStaffMembers } from "@/lib/staff-tasks";

// スタッフ個人シート §2: 名前を押すとその人のシートが開く（見られる人の名前だけ・判定はサーバー /api/growth/roster）
type RosterView = {
  name: string;
  link: "open" | "unlinked" | "ambiguous" | "none";
  userId?: string;
  next?: { date: string; time: string; answered: boolean; state: string } | null;
};

export default function StaffMembersAdminPage() {
  const [roster, setRoster] = useState<Map<string, RosterView>>(new Map());
  const [members, setMembers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 404（可能性ノートの権限が無い人＝名簿の管理だけを任された人など）のときはリンクを出さない
    fetch("/api/growth/roster", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ members?: RosterView[] }>) : { members: [] }))
      .then((j) => setRoster(new Map((j.members ?? []).map((m) => [m.name, m]))))
      .catch(() => {});
  }, [members]);

  useEffect(() => {
    loadStaffMembers()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const persist = async (next: string[]) => {
    setMembers(next);
    setSaving(true);
    await saveStaffMembers(next);
    setSaving(false);
  };

  const add = () => {
    const name = input.trim();
    if (!name || members.includes(name)) {
      setInput("");
      return;
    }
    persist([...members, name]);
    setInput("");
  };

  const remove = (name: string) => {
    persist(members.filter((m) => m !== name));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">👥 スタッフ名簿</h1>
        <p className="text-sm text-slate-600 mt-1">
          「みんなのタスク」の担当者候補に使う名前を管理します（追加・削除のみ）。
          名前を押すと、その人のスタッフ個人シートが開きます（見られる人の名前だけ）。
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
                add();
              }
            }}
            placeholder="スタッフ名を入力してEnter / 追加"
          />
          <Button onClick={add} disabled={!input.trim()}>
            追加
          </Button>
        </div>

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
                className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <RosterName name={m} view={roster.get(m)} />
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}

        {saving && <p className="text-xs text-slate-600">保存中...</p>}
      </div>
    </div>
  );
}

function RosterName({ name, view }: { name: string; view: RosterView | undefined }) {
  if (view?.link === "open" && view.userId) {
    const n = view.next;
    return (
      <span className="flex min-w-0 flex-col">
        <Link
          href={`/staff-growth/${encodeURIComponent(view.userId)}`}
          className="text-sm font-medium text-teal-800 underline underline-offset-2 min-h-[32px] inline-flex items-center"
          data-roster-open
        >
          {name}
        </Link>
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
            "次の1on1の予定なし"
          )}
        </span>
      </span>
    );
  }
  return (
    <span className="text-sm text-slate-700">
      {name}
      {view?.link === "unlinked" && (
        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700" title="アカウントの表示名と一致する人がいないため、シートを開けません">
          未連携
        </span>
      )}
      {view?.link === "ambiguous" && (
        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900" title="同じ名前の人が2人以上いるため、シートを開けません">
          同名あり・未連携
        </span>
      )}
    </span>
  );
}

