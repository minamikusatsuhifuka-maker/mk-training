"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  newTaskId,
  dateOnlyToIso,
  STATUS_LABELS,
  STATUS_ORDER,
  type StaffTask,
  type TaskStatus,
  type TaskCategoryDef,
  type ParsedTask,
} from "@/lib/staff-tasks";

type Props = {
  knownMembers: string[];
  /** カテゴリ選択肢（visibleTaskCategories 済みのもの） */
  categories: TaskCategoryDef[];
  onImport: (tasks: StaffTask[]) => void;
};

type Kind = "text" | "image";

type PendingFile = {
  id: string;
  file: File;
  kind: Kind;
  icon: string;
};

type ReviewRow = {
  id: string;
  include: boolean;
  title: string;
  /** 複数担当（チップ編集・指示書53） */
  assignees: string[];
  /** 行ごとの担当者追加入力欄 */
  assigneeInput: string;
  /** カテゴリid（"" = 未分類） */
  category: string;
  due: string; // YYYY-MM-DD or ""
  status: TaskStatus;
  note: string;
};

const MAX_FILES = 10;
const MAX_SIZE = 8 * 1024 * 1024; // 8MB/ファイル
const MAX_IMAGE_DIM = 1600; // 画像は長辺1600pxに縮小

const EXT_TEXT = ["txt", "md"];
const EXT_SHEET = ["xlsx", "xls", "csv", "tsv"];
const EXT_IMAGE = ["png", "jpg", "jpeg", "webp"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function classifyFile(
  file: File
): { kind: Kind; icon: string } | null {
  const ext = extOf(file.name);
  if (EXT_SHEET.includes(ext)) return { kind: "text", icon: "📊" };
  if (EXT_TEXT.includes(ext)) return { kind: "text", icon: "📝" };
  if (EXT_IMAGE.includes(ext)) return { kind: "image", icon: "🖼️" };
  return null;
}

// ─── 前処理 ───
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function sheetToText(file: File): Promise<string> {
  const ext = extOf(file.name);
  if (ext === "csv" || ext === "tsv") {
    // 簡易：そのままテキストで渡す
    return readAsText(file);
  }
  // xlsx/xls は SheetJS で CSV 化
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return `# シート: ${name}\n${csv}`;
  }).join("\n\n");
}

// 画像を長辺 MAX_IMAGE_DIM に縮小して base64（dataURLのprefix無し）を返す
function imageToBase64(
  file: File
): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(
        1,
        MAX_IMAGE_DIM / Math.max(img.width, img.height)
      );
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas未対応"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗"));
    };
    img.src = url;
  });
}

export function FileImport({ knownMembers, categories, onImport }: Props) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [message, setMessage] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    setMessage("");
    const list = Array.from(incoming);
    const next: PendingFile[] = [...files];
    const errors: string[] = [];

    for (const file of list) {
      if (next.length >= MAX_FILES) {
        errors.push(`最大${MAX_FILES}ファイルまでです`);
        break;
      }
      const cls = classifyFile(file);
      if (!cls) {
        errors.push(`非対応形式: ${file.name}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        errors.push(`サイズ超過(8MB): ${file.name}`);
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${next.length}-${file.lastModified}`,
        file,
        kind: cls.kind,
        icon: cls.icon,
      });
    }
    setFiles(next);
    if (errors.length) setMessage(errors.join(" / "));
  };

  const removeFile = (id: string) =>
    setFiles((f) => f.filter((x) => x.id !== id));

  const handleParse = async () => {
    if (files.length === 0) return;
    setParsing(true);
    setMessage("");
    setRows(null);
    try {
      const items = await Promise.all(
        files.map(async (pf) => {
          if (pf.kind === "image") {
            const { base64, mediaType } = await imageToBase64(pf.file);
            return {
              name: pf.file.name,
              kind: "image" as const,
              base64,
              mediaType,
            };
          }
          const ext = extOf(pf.file.name);
          const text = EXT_SHEET.includes(ext)
            ? await sheetToText(pf.file)
            : await readAsText(pf.file);
          return { name: pf.file.name, kind: "text" as const, text };
        })
      );

      const res = await fetch("/api/tasks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          members: knownMembers,
          categories: categories.map((c) => c.label),
        }),
      });
      const data = (await res.json()) as {
        tasks?: ParsedTask[];
        error?: string;
      };
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];

      if (tasks.length === 0) {
        setRows([]);
        setMessage(
          data.error
            ? "解析に失敗しました。手動で追加してください。"
            : "タスクを抽出できませんでした。内容をご確認のうえ手動で追加してください。"
        );
        return;
      }

      setRows(
        tasks.map((t, i) => {
          // AIが返すカテゴリ（ラベル想定）を定義の id に解決。一致しなければ未分類
          const cat = categories.find(
            (c) => c.label === t.category || c.id === t.category
          );
          return {
            id: `row-${i}`,
            include: true,
            title: t.title,
            assignees: t.assignees,
            assigneeInput: "",
            category: cat?.id ?? "",
            due: t.due ?? "",
            status: t.status,
            note: t.note,
          };
        })
      );
    } catch {
      setRows([]);
      setMessage("解析中にエラーが発生しました。手動で追加してください。");
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) =>
    setRows((rs) =>
      rs ? rs.map((r) => (r.id === id ? { ...r, ...patch } : r)) : rs
    );

  // 行の担当者チップ操作（追加/解除・自由入力チップ化）
  const toggleRowAssignee = (rowId: string, name: string) => {
    const n = name.trim();
    if (!n) return;
    setRows((rs) =>
      rs
        ? rs.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  assignees: r.assignees.includes(n)
                    ? r.assignees.filter((x) => x !== n)
                    : [...r.assignees, n],
                }
              : r
          )
        : rs
    );
  };

  const addRowAssigneeFromInput = (rowId: string) => {
    setRows((rs) =>
      rs
        ? rs.map((r) => {
            if (r.id !== rowId) return r;
            const n = r.assigneeInput.trim();
            if (!n) return r;
            return {
              ...r,
              assignees: r.assignees.includes(n)
                ? r.assignees
                : [...r.assignees, n],
              assigneeInput: "",
            };
          })
        : rs
    );
  };

  const selectedCount = rows?.filter((r) => r.include && r.title.trim()).length ?? 0;

  const handleAddSelected = () => {
    if (!rows) return;
    const nowIso = new Date().toISOString();
    const newTasks: StaffTask[] = rows
      .filter((r) => r.include && r.title.trim())
      .map((r) => {
        const list = r.assignees.map((a) => a.trim()).filter(Boolean);
        return {
          id: newTaskId(),
          title: r.title.trim(),
          assignee: list[0] ?? "",
          assignees: list,
          category: r.category || undefined,
          due: dateOnlyToIso(r.due || null),
          status: r.status,
          note: r.note.trim() || undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      });
    if (newTasks.length === 0) return;
    onImport(newTasks);
    // リセット
    setRows(null);
    setFiles([]);
    setMessage(`${newTasks.length}件を追加しました。`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">
        📎 ファイルからAIでタスク化（β）
      </h2>

      {/* ドロップゾーン */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragOver
            ? "border-teal bg-teal-light/40"
            : "border-border hover:border-foreground/30"
        }`}
      >
        <p className="text-foreground/70">
          ここにファイルをドラッグ&ドロップ、またはクリックで選択
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          表(.xlsx/.xls/.csv/.tsv) ・ テキスト(.txt/.md) ・ 画像(.png/.jpg/.jpeg/.webp)／最大{MAX_FILES}件・各8MBまで
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* ファイルチップ */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((pf) => (
            <span
              key={pf.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
            >
              <span>{pf.icon}</span>
              <span className="max-w-[180px] truncate">{pf.file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(pf.id)}
                className="text-foreground/50 hover:text-red-600"
                title="削除"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleParse}
          disabled={parsing || files.length === 0}
          size="sm"
        >
          {parsing ? "解析中..." : `まとめて解析（${files.length}）`}
        </Button>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>

      {/* レビュー */}
      {rows && rows.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              解析結果（確認・編集してから追加）
            </h3>
            <Button onClick={handleAddSelected} size="sm" disabled={selectedCount === 0}>
              選択した {selectedCount} 件を追加
            </Button>
          </div>

          <datalist id="import-assignee-list">
            {knownMembers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`rounded-md border px-3 py-2 ${
                  r.include ? "border-border bg-background" : "border-border bg-muted/40 opacity-60"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                    className="mt-2"
                    title="取り込む"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <Input
                      className="sm:col-span-6 h-8 text-sm"
                      value={r.title}
                      onChange={(e) => updateRow(r.id, { title: e.target.value })}
                      placeholder="内容"
                    />
                    <select
                      value={r.category}
                      onChange={(e) =>
                        updateRow(r.id, { category: e.target.value })
                      }
                      className="sm:col-span-2 h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                      title="カテゴリ"
                    >
                      <option value="">未分類</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      className="sm:col-span-2 h-8 text-sm"
                      value={r.due}
                      onChange={(e) => updateRow(r.id, { due: e.target.value })}
                    />
                    <select
                      value={r.status}
                      onChange={(e) =>
                        updateRow(r.id, { status: e.target.value as TaskStatus })
                      }
                      className="sm:col-span-2 h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    {/* 担当者チップ（複数・×で解除、入力+Enterで追加） */}
                    <div className="sm:col-span-12 flex flex-wrap items-center gap-1.5">
                      {r.assignees.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-light text-teal rounded-full text-xs"
                        >
                          {a}
                          <button
                            type="button"
                            onClick={() => toggleRowAssignee(r.id, a)}
                            className="opacity-60 hover:opacity-100 leading-none"
                            aria-label={`${a} を担当から外す`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <Input
                        className="h-7 w-44 text-xs"
                        list="import-assignee-list"
                        value={r.assigneeInput}
                        onChange={(e) =>
                          updateRow(r.id, { assigneeInput: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            addRowAssigneeFromInput(r.id);
                          }
                        }}
                        placeholder="担当者を追加（Enter）"
                      />
                    </div>
                    <Input
                      className="sm:col-span-12 h-8 text-sm"
                      value={r.note}
                      onChange={(e) => updateRow(r.id, { note: e.target.value })}
                      placeholder="メモ（任意）"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
