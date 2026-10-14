"use client";

// ファイルのドラッグ＆ドロップ領域（指示書186 A）
// - ファイルをドラッグすると枠の色が変わる。複数ファイルをまとめて受け取る
// - 「ファイルを選択」ボタンは残す（iPhone・iPad はこちら）
// - 領域の外に落としてもブラウザがファイルを開いて画面が移動しないよう、window の dragover/drop を既定動作なしにする
//   （領域内の drop は自分で処理する）

import { useEffect, useRef, useState } from "react";

/** 186 A-2 の文（231: お知らせ・イベントでも同じ文を使う。新しい言い回しを作らない） */
export const DROP_HERE_TEXT = "ここに離すと追加されます";
export const DROP_GUIDE_TEXT = "ここにファイルをドラッグ＆ドロップ（複数可）";

/**
 * 186 A-2: 領域外へのドロップで画面が移動しないようにする（ブラウザがファイルを開くと、書きかけの入力が消える）。
 * ページに1つでも使っていれば効く。231 で DropZone 以外の欄（お知らせ・イベントの「貼るもの」）からも使えるよう切り出した。
 */
export function usePreventWindowFileDrop(): void {
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
}

export function DropZone({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  label,
  hint,
  className = "",
  testId,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  className?: string;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 186 A-2: 領域外へのドロップで画面が移動しないようにする（ページに1つでも DropZone があれば効く）
  usePreventWindowFileDrop();

  const take = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    if (files.length === 0) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      data-dropzone={testId ?? "true"}
      data-over={over ? "1" : "0"}
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        // 子要素への移動では消さない
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        take(e.dataTransfer.files);
      }}
      className={`rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
        over ? "border-teal-500 bg-teal-50" : "border-gray-300 bg-white"
      } ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <p className="text-[12px] text-gray-800">{over ? DROP_HERE_TEXT : label}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
      <div className="mt-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[40px]"
        >
          📂 ファイルを選択
        </button>
      </div>
    </div>
  );
}

/**
 * 233: すでに「選ぶ」欄（input type="file"）がある画面を、そのままドラッグ＆ドロップにも対応させる包み。
 *
 * 【同じ処理を通す】落とされたファイルを、包みの中の「選ぶ」欄そのものに入れ、選んだときと同じ change の合図を送る。
 *   画面は「選ぶ」で選ばれたときと区別がつかない＝種類・大きさ・数の確かめ、画像の変換、断るときの知らせが1字も変わらない。
 *   （書き起こしのように、保存を押したときに欄から読む画面でも、そのまま同じ結果になる）
 * 【1つだけの欄】欄に multiple が無ければ、最初の1つだけを入れる（選ぶときと同じ）。
 * 【使えない間】欄が disabled（読み込み中など）のときは受け付けない。
 * 【欄の外】usePreventWindowFileDrop でブラウザがファイルを開かない（入力中の内容が消えない）。
 * 文言は 186 の部品と同じ「ここに離すと追加されます」だけ（新しい言い回しは作らない）。
 */
export function FileDropArea({
  children,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  usePreventWindowFileDrop();

  const inputOf = (): HTMLInputElement | null =>
    boxRef.current?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const usable = () => {
    const input = inputOf();
    return !!input && !input.disabled;
  };

  return (
    <div
      ref={boxRef}
      data-file-drop-area={testId ?? "true"}
      data-over={over ? "1" : "0"}
      onDragEnter={(e) => {
        if (!isFileDrag(e) || !usable()) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e) || !usable()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const input = inputOf();
        if (!input || input.disabled) return;
        const dropped = Array.from(e.dataTransfer.files);
        if (dropped.length === 0) return;
        const dt = new DataTransfer();
        for (const f of input.multiple ? dropped : dropped.slice(0, 1)) dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }}
      className={`rounded-lg border-2 border-dashed transition-colors ${
        over ? "border-teal-500 bg-teal-50" : "border-transparent"
      } ${className}`}
    >
      {children}
      {over && <p className="px-1 text-[12px] font-medium text-teal-800">{DROP_HERE_TEXT}</p>}
    </div>
  );
}
