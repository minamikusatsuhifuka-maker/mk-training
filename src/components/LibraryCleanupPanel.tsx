"use client";

// 資料庫のお掃除パネル（指示書147・管理者のみ表示）
// 「🔍 重複をチェック」→ グループごとに承認 → 削除。
// 承認なしに削除は起きない（チェックは読み取りのみ）。

import { useState } from "react";
import {
  DUP_KIND_META,
  isContentIdentical,
  type CleanupGroup,
} from "@/lib/library-cleanup";

type ScanResult = {
  groups: CleanupGroup[];
  scanned: number;
  hashed: number;
  skippedForBudget: number;
  dismissedCount: number;
};

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return (iso || "").slice(0, 10) || "—";
}

export function LibraryCleanupPanel({
  onChanged,
}: {
  /** 削除が実行されたら資料一覧を再読込させる */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  /** グループごとの「残す」選択（未選択は推奨に従う） */
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});

  const scan = async () => {
    setScanning(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/library/cleanup", {
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "チェックに失敗しました");
      setResult(json as ScanResult);
      setKeepChoice({});
      if ((json.groups as CleanupGroup[]).length === 0) {
        setMsg("重複の候補は見つかりませんでした。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "チェックに失敗しました");
    } finally {
      setScanning(false);
    }
  };

  const keepIdOf = (g: CleanupGroup) => keepChoice[g.key] ?? g.keepId;

  const post = async (
    action: "delete" | "dismiss",
    docIds: string[],
    key: string
  ) => {
    setBusyKey(key);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/library/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, docIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "処理に失敗しました");
      if (action === "delete") {
        setMsg(`🧹 ${json.deleted}件を削除しました（残り${json.remaining}件）`);
        onChanged();
      } else {
        setMsg("この組み合わせは今後候補に出しません。");
      }
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const approveGroup = (g: CleanupGroup) => {
    const keepId = keepIdOf(g);
    const dels = g.members.filter((m) => m.doc.id !== keepId);
    const names = dels.map((m) => `・${m.doc.fileName || m.doc.title}`).join("\n");
    if (
      !confirm(
        `${dels.length}件を削除します。\n\n${names}\n\n` +
          `残す: ${g.members.find((m) => m.doc.id === keepId)?.doc.fileName ?? ""}\n\n` +
          `⚠️ この削除は復元できません（ファイル本体も一緒に消えます）。よろしいですか？`
      )
    ) {
      return;
    }
    post("delete", dels.map((m) => m.doc.id), g.key);
  };

  const dismissGroup = (g: CleanupGroup) => {
    if (!confirm("この組み合わせを「重複ではない」として、今後候補に出さないようにしますか？")) {
      return;
    }
    post("dismiss", g.members.map((m) => m.doc.id), g.key);
  };

  // 一括承認は「中身が1バイトも同じ」と確定したグループだけに限る。
  // 中身が違うものは開いて確かめないと判断できないため、まとめ削除の対象にしない。
  const bulkGroups = (result?.groups ?? []).filter((g) =>
    isContentIdentical(g.kind)
  );
  const bulkDeleteIds = bulkGroups.flatMap((g) =>
    g.members.filter((m) => m.doc.id !== keepIdOf(g)).map((m) => m.doc.id)
  );

  const approveBulk = () => {
    const names = bulkGroups
      .flatMap((g) =>
        g.members
          .filter((m) => m.doc.id !== keepIdOf(g))
          .map((m) => `・${m.doc.fileName || m.doc.title}`)
      )
      .join("\n");
    if (
      !confirm(
        `中身が完全に同一と確認できた ${bulkDeleteIds.length}件を削除します。\n\n${names}\n\n` +
          `⚠️ この削除は復元できません（ファイル本体も一緒に消えます）。よろしいですか？`
      )
    ) {
      return;
    }
    post("delete", bulkDeleteIds, "__bulk__");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          🧹 資料庫のお掃除
          <span className="ml-2 text-xs font-normal text-gray-600">
            重複を検出して、承認したものだけ削除します
          </span>
        </span>
        <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={scan}
              disabled={scanning}
              className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
            >
              {scanning ? "チェック中…" : "🔍 重複をチェック"}
            </button>
            {result && (
              <span className="text-xs text-gray-600">
                {result.scanned}件を確認 / 候補 {result.groups.length}組
                {result.dismissedCount > 0 &&
                  `（除外中のペア ${result.dismissedCount}）`}
              </span>
            )}
          </div>

          {result && result.skippedForBudget > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              ⚠️ ファイルが大きいため {result.skippedForBudget}
              件は中身の照合を省略しました（資料名での判定のみ）。
            </p>
          )}
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

          {bulkDeleteIds.length > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs text-gray-700 mb-2">
                中身が1バイトも違わないと確認できたグループだけ、まとめて処理できます
                （中身が違うものは1組ずつ確認してください）。
              </p>
              <button
                type="button"
                onClick={approveBulk}
                disabled={busyKey !== null}
                className="text-sm px-4 py-2 bg-rose-600 text-white rounded-full hover:bg-rose-700 disabled:opacity-40 min-h-[40px]"
              >
                ✅ 完全同一の {bulkDeleteIds.length}件をまとめて削除
              </button>
            </div>
          )}

          {(result?.groups ?? []).map((g) => {
            const meta = DUP_KIND_META[g.kind];
            const keepId = keepIdOf(g);
            const delCount = g.members.length - 1;
            return (
              <div
                key={g.key}
                className={`p-3 rounded-xl border ${
                  isContentIdentical(g.kind)
                    ? "bg-white border-gray-200"
                    : "bg-amber-50 border-amber-200"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">
                  {meta.label}
                  {g.similarity !== undefined && (
                    <span className="ml-1 text-xs font-normal text-gray-600">
                      （資料名の一致度 {Math.round(g.similarity * 100)}%）
                    </span>
                  )}
                  <span className="ml-2 text-xs font-normal text-gray-600">
                    {g.members.length}件
                  </span>
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{meta.desc}</p>
                <p className="text-xs text-teal-800 mt-1">
                  残す推奨の理由: {g.keepReason || "—"}
                </p>

                <div className="mt-2 space-y-1.5">
                  {g.members.map((m) => {
                    const keep = m.doc.id === keepId;
                    return (
                      <label
                        key={m.doc.id}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                          keep
                            ? "bg-teal-50 border-teal-300"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`keep-${g.key}`}
                          checked={keep}
                          onChange={() =>
                            setKeepChoice((prev) => ({
                              ...prev,
                              [g.key]: m.doc.id,
                            }))
                          }
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-gray-900 break-all">
                            {keep ? "★ 残す　" : "削除候補　"}
                            {m.doc.fileName || m.doc.title}
                          </span>
                          <span className="block text-[11px] text-gray-600 mt-0.5">
                            {m.doc.category} ／ 登録 {fmtDate(m.doc.uploadedAt)} ／{" "}
                            {fmtBytes(m.size)} ／ 検索メタ {m.metaScore}
                            {!m.doc.summary?.trim() && " ／ 要約なし"}
                          </span>
                          {m.doc.fileUrl && (
                            <a
                              href={m.doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block text-[11px] text-teal-700 underline mt-0.5"
                            >
                              中身を確認する ↗
                            </a>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => approveGroup(g)}
                    disabled={busyKey !== null}
                    className="text-xs px-3 py-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 disabled:opacity-40 min-h-[36px]"
                  >
                    {busyKey === g.key
                      ? "処理中…"
                      : `✅ この${delCount}件を削除して承認`}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissGroup(g)}
                    disabled={busyKey !== null}
                    className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50 disabled:opacity-40 min-h-[36px]"
                  >
                    重複ではない
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
