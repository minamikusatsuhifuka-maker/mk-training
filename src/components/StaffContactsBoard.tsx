"use client";

// スタッフ連絡先の本体（指示書169）
// 画面に到達できている時点でサーバー側の認可は通っている（ここでの出し分けは体裁のみ）。
//
// 一覧は氏名と主要な連絡先だけ、詳細は全項目（169-3-3）。
// 編集・削除は管理者のみ（169-1-2。API側でも管理者判定をやり直している）。
// 退職者（無効化されたアカウント）は既定で隠し、切り替えで見られる（169-3-4）。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMERGENCY_MAX,
  createStaffContact,
  deleteStaffContact,
  emptyStaffContact,
  fetchStaffContacts,
  matchStaffContact,
  patchStaffContact,
  sortStaffContacts,
  type EmergencyContact,
  type StaffContact,
  type StaffContactInput,
} from "@/lib/staff-contacts";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

export function StaffContactsBoard({ isAdmin }: { isAdmin: boolean }) {
  const [contacts, setContacts] = useState<StaffContact[]>([]);
  const [retired, setRetired] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [expanded, setExpanded] = useState("");
  /** "" = 閉じている / "new" = 新規登録 / それ以外 = そのidを編集中 */
  const [editing, setEditing] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [json, idx] = await Promise.all([
        fetchStaffContacts(),
        // 指名や紐付けの候補に使う名簿（無効化アカウントはサーバー側で除外済み）
        loadProfilesIndex().catch(() => [] as StaffProfileIndexEntry[]),
      ]);
      setContacts(json.contacts);
      setRetired(new Set(json.retiredUserIds));
      setTableMissing(json.tableMissing);
      setMembers(idx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isRetired = useCallback(
    (c: StaffContact) => !!c.userId && retired.has(c.userId),
    [retired]
  );

  const visible = useMemo(() => {
    const list = contacts.filter(
      (c) =>
        (showRetired || !isRetired(c)) && matchStaffContact(c, keyword)
    );
    return sortStaffContacts(list);
  }, [contacts, showRetired, keyword, isRetired]);

  const retiredCount = useMemo(
    () => contacts.filter(isRetired).length,
    [contacts, isRetired]
  );

  const flash = (text: string) => {
    setMsg(text);
    setError("");
  };

  const submit = async (id: string, input: StaffContactInput) => {
    setBusy(true);
    setError("");
    try {
      if (id === "new") {
        const created = await createStaffContact(input);
        setContacts((prev) => [...prev, created]);
        flash("💾 連絡先を登録しました");
      } else {
        const saved = await patchStaffContact(id, input);
        setContacts((prev) => prev.map((c) => (c.id === id ? saved : c)));
        flash("💾 連絡先を更新しました");
      }
      setEditing("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: StaffContact) => {
    if (
      !confirm(
        `${c.name} さんの連絡先を削除します。\n\n削除すると元に戻せません（緊急連絡先も一緒に消えます）。よろしいですか？`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteStaffContact(c.id);
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      setEditing("");
      setExpanded("");
      flash("🗑 連絡先を削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (tableMissing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-gray-900">
            📇 スタッフ連絡先の準備がまだ終わっていません
          </p>
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
            データの保存先（テーブル）がまだ作られていません。
            <code className="mx-1">
              ~/Downloads/169_スタッフ連絡先_テーブル作成.sql
            </code>
            を Supabase の SQL Editor で実行してください。
            実行後にこのページを再読み込みすると使えるようになります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">📇 スタッフ連絡先</h1>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          緊急時に連絡を取るための記録です。
          <strong>画面の撮影・転記・院外への持ち出しはしないでください。</strong>
          {isAdmin ? (
            <>
              <br />
              登録・修正・削除は管理者だけが行えます。
            </>
          ) : (
            <>
              <br />
              内容の修正が必要なときは<strong>院長にお伝えください</strong>
              （この画面からは変更できません）。
            </>
          )}
        </p>
      </header>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">
          {msg}
        </p>
      )}

      {/* 検索・絞り込み（169-3-3） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・電話番号・住所などで検索"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px]"
        />
        <label className="flex items-center gap-2 text-[11px] text-gray-700 min-h-[36px]">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          退職者（無効化したアカウント）も表示する
          {retiredCount > 0 && (
            <span className="text-gray-500">（{retiredCount}件）</span>
          )}
        </label>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          退職した方の記録は自動では消えません（一定期間は連絡が必要になる場合があるため）。
          削除は管理者が明示的に行います。
        </p>
      </div>

      {isAdmin && (
        <div>
          {editing === "new" ? (
            <StaffContactForm
              key="new"
              initial={emptyStaffContact()}
              members={members}
              busy={busy}
              onCancel={() => setEditing("")}
              onSubmit={(input) => submit("new", input)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditing("new");
                setMsg("");
              }}
              className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px]"
            >
              ＋ 連絡先を登録
            </button>
          )}
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-600">
          {contacts.length === 0
            ? "まだ登録がありません。"
            : "条件に合う人がいません。"}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white overflow-hidden"
            >
              {editing === c.id ? (
                <div className="p-3">
                  <StaffContactForm
                    key={c.id}
                    initial={c}
                    members={members}
                    busy={busy}
                    onCancel={() => setEditing("")}
                    onSubmit={(input) => submit(c.id, input)}
                  />
                </div>
              ) : (
                <>
                  {/* 一覧は氏名と主要な連絡先だけ（169-3-3） */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((v) => (v === c.id ? "" : c.id))
                    }
                    className="w-full text-left px-3 py-2.5 min-h-[52px] flex items-center justify-between gap-2 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">
                        {c.name}
                      </span>
                      {isRetired(c) && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600">
                          退職
                        </span>
                      )}
                      <span className="block text-[11px] text-gray-600 truncate">
                        {c.phoneMobile || c.phoneHome || "電話番号の登録なし"}
                      </span>
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {expanded === c.id ? "▲" : "▼"}
                    </span>
                  </button>

                  {expanded === c.id && (
                    <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2">
                      <ContactDetail contact={c} />

                      {isAdmin && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(c.id);
                              setMsg("");
                            }}
                            className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[40px]"
                          >
                            ✏️ 編集
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(c)}
                            disabled={busy}
                            className="px-3 py-2 border border-red-300 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[40px]"
                          >
                            🗑 削除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 詳細（全項目）。電話番号はそのまま発信できるようにする */
function ContactDetail({ contact }: { contact: StaffContact }) {
  return (
    <div className="space-y-2 text-[12px] leading-relaxed">
      <dl className="space-y-1">
        <Row label="住所" value={contact.address} />
        <Row label="電話（携帯）" value={contact.phoneMobile} tel />
        <Row label="電話（自宅）" value={contact.phoneHome} tel />
        <Row label="メール（私用）" value={contact.privateEmail} />
        <Row label="生年月日" value={contact.birthday} />
        <Row label="入職日" value={contact.joinedOn} />
        <Row label="備考" value={contact.memo} />
      </dl>

      <div>
        <p className="text-[11px] font-medium text-gray-800">
          🚨 緊急連絡先・保証人
        </p>
        {contact.emergency.length === 0 ? (
          <p className="text-[11px] text-gray-500 mt-0.5">登録がありません。</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {contact.emergency.map((e, i) => (
              <li
                key={`${contact.id}-em-${i}`}
                className="rounded-lg border border-gray-200 p-2"
              >
                <p className="text-gray-900">
                  {e.name}
                  {e.relation && (
                    <span className="ml-1.5 text-[11px] text-gray-600">
                      （{e.relation}）
                    </span>
                  )}
                </p>
                {e.phone && (
                  <p>
                    <a
                      href={`tel:${e.phone.replace(/[^\d+]/g, "")}`}
                      className="text-teal-700 underline underline-offset-2"
                    >
                      {e.phone}
                    </a>
                  </p>
                )}
                {e.memo && (
                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap">
                    {e.memo}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
          ここに載っているご家族・保証人の方は、
          <strong>緊急時の連絡のためだけ</strong>に登録されています。
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tel,
}: {
  label: string;
  value: string;
  tel?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 w-[6.5em] text-gray-500">{label}</dt>
      <dd className="min-w-0 text-gray-900 whitespace-pre-wrap break-words">
        {tel ? (
          <a
            href={`tel:${value.replace(/[^\d+]/g, "")}`}
            className="text-teal-700 underline underline-offset-2"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/**
 * 登録・編集フォーム（管理者のみ到達する）。
 * 項目は指示書169-2-1／2-2のものだけ。2-3のものは型に無いので入力欄も作れない。
 */
function StaffContactForm({
  initial,
  members,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: StaffContact;
  members: StaffProfileIndexEntry[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: StaffContactInput) => void;
}) {
  const [form, setForm] = useState<StaffContactInput>({
    userId: initial.userId,
    name: initial.name,
    address: initial.address,
    phoneMobile: initial.phoneMobile,
    phoneHome: initial.phoneHome,
    privateEmail: initial.privateEmail,
    birthday: initial.birthday,
    joinedOn: initial.joinedOn,
    memo: initial.memo,
    emergency: initial.emergency.length
      ? initial.emergency
      : [{ name: "", relation: "", phone: "", memo: "" }],
  });

  const set = <K extends keyof StaffContactInput>(
    key: K,
    value: StaffContactInput[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const setEmergency = (index: number, patch: Partial<EmergencyContact>) =>
    setForm((prev) => ({
      ...prev,
      emergency: prev.emergency.map((e, i) =>
        i === index ? { ...e, ...patch } : e
      ),
    }));

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-3">
      <p className="text-sm font-medium text-gray-900">
        {initial.id ? "✏️ 連絡先を編集" : "＋ 連絡先を登録"}
      </p>

      <Field label="氏名（必須）">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className={inputClass}
          placeholder="南草津 花子"
        />
      </Field>

      <Field label="アカウントの紐付け">
        <select
          value={form.userId}
          onChange={(e) => set("userId", e.target.value)}
          className={inputClass}
        >
          <option value="">紐付けない</option>
          {/* 保存済みのIDが名簿に無いとき（退職者など）に選択が消えないよう残す */}
          {form.userId && !members.some((m) => m.userId === form.userId) && (
            <option value={form.userId}>（名簿に出ていないアカウント）</option>
          )}
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-500 mt-1">
          紐付けると、そのアカウントを無効化したときに「退職」として扱われます。
        </p>
      </Field>

      <Field label="住所">
        <input
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="電話番号（携帯）">
          <input
            type="tel"
            value={form.phoneMobile}
            onChange={(e) => set("phoneMobile", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="電話番号（自宅）">
          <input
            type="tel"
            value={form.phoneHome}
            onChange={(e) => set("phoneHome", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="メールアドレス（私用）">
        <input
          type="email"
          value={form.privateEmail}
          onChange={(e) => set("privateEmail", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="生年月日">
          <input
            type="date"
            value={form.birthday}
            onChange={(e) => set("birthday", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="入職日">
          <input
            type="date"
            value={form.joinedOn}
            onChange={(e) => set("joinedOn", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="備考">
        <textarea
          value={form.memo}
          onChange={(e) => set("memo", e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        />
      </Field>

      <section className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
        <p className="text-xs font-medium text-gray-800">
          🚨 緊急連絡先・保証人（最大{EMERGENCY_MAX}件）
        </p>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          ご本人ではない方の情報です。<strong>氏名・続柄・電話番号だけ</strong>を登録します
          （住所・生年月日・勤務先の欄は設けていません）。
          登録の前に、ご本人からご家族へ一言お伝えいただくと行き違いがありません。
        </p>
        {form.emergency.map((e, i) => (
          <div key={`em-${i}`} className="rounded-lg border border-gray-200 p-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="氏名">
                <input
                  value={e.name}
                  onChange={(ev) => setEmergency(i, { name: ev.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="続柄">
                <input
                  value={e.relation}
                  onChange={(ev) =>
                    setEmergency(i, { relation: ev.target.value })
                  }
                  className={inputClass}
                  placeholder="母・配偶者 など"
                />
              </Field>
            </div>
            <Field label="電話番号">
              <input
                type="tel"
                value={e.phone}
                onChange={(ev) => setEmergency(i, { phone: ev.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="備考">
              <input
                value={e.memo}
                onChange={(ev) => setEmergency(i, { memo: ev.target.value })}
                className={inputClass}
                placeholder="日中はつながりにくい など"
              />
            </Field>
          </div>
        ))}
        {form.emergency.length < EMERGENCY_MAX && (
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                emergency: [
                  ...prev.emergency,
                  { name: "", relation: "", phone: "", memo: "" },
                ],
              }))
            }
            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 min-h-[40px]"
          >
            ＋ もう1件ふやす
          </button>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSubmit(form)}
          disabled={busy || !form.name.trim()}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          {busy ? "保存中…" : "💾 保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-700">{label}</span>
      <span className="block mt-0.5">{children}</span>
    </label>
  );
}
