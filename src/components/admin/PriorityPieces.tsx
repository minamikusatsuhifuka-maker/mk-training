"use client";

// 四象限マトリクスの小さな共通部品（指示書202）
//
// ・SaveMark        … 行・マスの中に出す「保存中…／保存済み／失敗」の小さな印（202 §2・§3）
// ・InlineAddInput  … その場に出る1行の入力欄。**Enterで登録して欄は開いたまま**（202 §1・§4）
// ・useTextDraft    … 確定前の文字を sessionStorage に預ける（202 §2「書きかけ保持」）
//
// 【部品はモジュール直下に置く（201の実測で踏んだ罠）】
// 描画関数の中で部品を定義すると、再描画のたびに別部品として作り直され、
// 押した瞬間にDOMが差し替わってクリックがReactに届かないことがある。必ずここに置いて props で渡す。

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, readDraft, writeDraft } from "@/lib/retro-drafts";

// ─── 保存の状態（自動保存の見える化・202 §2） ───

export type SaveState = "" | "saving" | "saved" | "error";

export function SaveMark({ state }: { state: SaveState }) {
  if (!state) return null;
  const text = state === "saving" ? "保存中…" : state === "saved" ? "保存済み" : "保存できません";
  const tone =
    state === "saving"
      ? "text-slate-500"
      : state === "saved"
        ? "text-teal-700"
        : "font-bold text-rose-700";
  return (
    <span className={`shrink-0 text-[10px] ${tone}`} data-pm-save-state={state}>
      {text}
    </span>
  );
}

/** 失敗したときだけ少し長く残す（成功は2秒で消す）ための待ち時間 */
export const SAVED_MARK_MS = 2000;

// ─── 確定前の文字を預ける（202 §2・176-補の下書き保持の考え方をそのまま使う） ───

/**
 * 入力中の文字を sessionStorage に預ける。
 * 保存ボタンを押す前・確定する前に閉じても、同じ場所を開けば書きかけが戻る。
 * 置き場は sessionStorage だけ（タブを閉じれば消える）。
 */
export function useTextDraft(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    const d = readDraft<{ v?: unknown }>(key);
    return d && typeof d.v === "string" ? d.v : initial;
  });

  const change = useCallback(
    (next: string) => {
      setValue(next);
      if (next === initial) clearDraft(key);
      else writeDraft(key, { v: next });
    },
    [key, initial]
  );

  /** 確定した（サーバーに入った）ので下書きは捨てる */
  const settle = useCallback(
    (next: string) => {
      clearDraft(key);
      setValue(next);
    },
    [key]
  );

  const hasDraft = value !== initial;

  return { value, change, settle, hasDraft };
}

// ─── その場に出る1行の入力欄（202 §1・§4） ───

/**
/**
 * 【実測で踏んだ罠】入力欄に disabled を付けてはいけない。
 * 送信中だけ disabled にしたところ、Chromium が disabled になった瞬間に焦点を外し、
 * そのあと focus() を呼んでも（まだ disabled なので）効かず、
 * 「Enterで登録して欄は開いたまま続けて書ける」が1件目で止まった。
 * 二重送信は ref で止め、入力欄は常に書ける状態にしておく。
 */
/**
 * 象限の空いている所・「＋ ここに追加」・9マス帳の欄から出る1行入力。
 *   Enter          … 登録して**欄は開いたまま**（続けて書ける）
 *   空のままEnter   … 閉じる
 *   Esc            … 閉じる（書きかけは預けたまま＝もう一度開けば戻る）
 */
export function InlineAddInput({
  draftKey,
  placeholder,
  label,
  onSubmit,
  onClose,
}: {
  draftKey: string;
  placeholder: string;
  /** 読み上げ用の名前 */
  label: string;
  /** 登録。失敗したら throw（入力は消さない） */
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const { value, change, settle } = useTextDraft(draftKey, "");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  /** 送信中の二重送信止め。**input を disabled にしてはいけない**（下の注意） */
  const sending = useRef(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = async () => {
    if (sending.current) return;
    const text = value.trim();
    if (!text) {
      onClose();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      await onSubmit(text);
      settle(""); // 入ったので下書きは捨て、欄は空にして開いたまま
    } catch {
      /* 文言は呼び出し側が赤い帯で出す。入力は消さない */
    } finally {
      sending.current = false;
      setBusy(false);
      // 続けて書けるように焦点を戻す（念のため・ふだんは外れない）
      ref.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-1.5" data-pm-add-input>
      <input
        ref={ref}
        type="text"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-teal-400 bg-white px-2 py-1 text-xs text-slate-800"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !value.trim()}
        data-pm-add-submit
        className="shrink-0 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
      >
        {busy ? "…" : "登録"}
      </button>
      <button
        type="button"
        onClick={onClose}
        data-pm-add-close
        className="shrink-0 rounded-md border border-slate-300 px-1.5 py-1 text-[11px] text-slate-600"
        aria-label="入力欄を閉じる"
      >
        ✕
      </button>
    </div>
  );
}

/** 「Enterで続けて登録できます」の案内（入力欄の下に小さく） */
export function InlineAddHint() {
  return (
    <p className="mt-0.5 text-[10px] text-slate-500">
      Enterで登録（続けて書けます）・空のままEnterまたはEscで閉じます
    </p>
  );
}
