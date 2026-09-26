"use client";

// ファイルのドラッグ＆ドロップ領域（指示書186 A）
// - ファイルをドラッグすると枠の色が変わる。複数ファイルをまとめて受け取る
// - 「ファイルを選択」ボタンは残す（iPhone・iPad はこちら）
// - 領域の外に落としてもブラウザがファイルを開いて画面が移動しないよう、window の dragover/drop を既定動作なしにする
//   （領域内の drop は自分で処理する）

import { useEffect, useRef, useState } from "react";

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
      <p className="text-[12px] text-gray-800">{over ? "ここに離すと追加されます" : label}</p>
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
