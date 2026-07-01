"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadStaffMembers, saveStaffMembers } from "@/lib/staff-tasks";

export default function StaffMembersAdminPage() {
  const [members, setMembers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

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
          「みんなのタスク」の担当者候補に使う名前を管理します（追加・削除のみ）
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
                <span className="text-sm text-slate-700">{m}</span>
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
