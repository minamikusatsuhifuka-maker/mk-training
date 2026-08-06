"use client";

// 記念日のお祝い（指示書146-E）
// 入職記念日・誕生日の当日だけ、**ログインしている本人のホームに**お祝いカードを出す。
// 他者の画面には出さない（そもそも他人の記念日はサーバー側で配信されない）。
// 当番マスコットがお祝いに来る形にして、146-A と絵柄をそろえる。

import { useEffect, useState } from "react";
import { CharacterSVG } from "@/components/CharacterNotification";
import { celebrationsForToday, type Celebration } from "@/lib/anniversary";
import { currentYm, loadMascotDuty, mascotForYm } from "@/lib/mascot-duty";
import { loadStaffProfile } from "@/lib/staff-profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { CharacterSvgType } from "@/types/portal";

export function AnniversarySection() {
  const [items, setItems] = useState<Celebration[]>([]);
  const [mascot, setMascot] = useState<CharacterSvgType | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getSupabaseBrowserClient().auth.getUser();
        const uid = data.user?.id;
        if (!uid) return;
        const [profile, dutyStore] = await Promise.all([
          loadStaffProfile(uid),
          loadMascotDuty(),
        ]);
        if (cancelled) return;
        const found = celebrationsForToday(profile);
        if (found.length === 0) return;
        setItems(found);
        setMascot(mascotForYm(dutyStore, currentYm()));
      } catch {
        /* 取得失敗時は何も出さない（ホームは壊さない） */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
        <div className="flex items-center gap-3">
          {mascot && (
            <div className="shrink-0 mascot-card-bounce">
              <CharacterSVG type={mascot} size={56} />
            </div>
          )}
          <div className="min-w-0">
            {items.map((c) => (
              <p
                key={c.kind}
                className="text-base font-medium text-gray-900 leading-snug"
              >
                {c.kind === "birthday" ? "🎂 " : "🎉 "}
                {c.message}
              </p>
            ))}
            <p className="text-xs text-gray-600 mt-1">
              いつもありがとうございます。今日もよい一日になりますように。
            </p>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          このお祝いはあなたにだけ表示されています。
        </p>
      </div>
    </section>
  );
}
