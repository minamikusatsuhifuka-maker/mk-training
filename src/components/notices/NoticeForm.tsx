"use client";

// 📣 お知らせ・イベントをつくる／直す（指示書228 §2-2）
// 貼れるもの：画像（JPEG・PNG・HEIC・WebP）・PDF・Word（.docx）。1ファイル10MBまで、1件に10ファイルまで。
// 画像は送る前に端末で描き直す（位置情報などを消す・HEICはJPEGに）。サーバーでももう一度消す。

import { useMemo, useRef, useState } from "react";
import { DROP_GUIDE_TEXT, DROP_HERE_TEXT, usePreventWindowFileDrop } from "@/components/DropZone";
import { TimeSelect } from "@/components/TimeSelect";
import {
  createNotice,
  removeNoticeFile,
  updateNotice,
  uploadNoticeFile,
  type NoticeFormValue,
} from "@/lib/notices-client";
import {
  NOTICE_BODY_MAX,
  NOTICE_FILE_MAX_BYTES,
  NOTICE_FILE_MAX_COUNT,
  NOTICE_TITLE_MAX,
  attachmentKindOf,
  defaultRsvpDeadline,
  formatBytes,
  type Notice,
  type NoticeAttachment,
} from "@/lib/notices";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const KIND_ICON: Record<string, string> = { image: "🖼", pdf: "📄", docx: "📝" };

export function NoticeForm({
  initial,
  onDone,
  onCancel,
}: {
  /** 直すときのお知らせ（つくるときは無し） */
  initial?: Notice;
  /** 保存が終わった（貼ったものも含めて）。開くお知らせのidと、貼れなかったファイルの知らせ */
  onDone: (id: string, warnings: string[]) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<NoticeFormValue>(() => ({
    kind: initial?.kind ?? "notice",
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    heldOn: initial?.heldOn ?? "",
    heldTime: initial?.heldTime ?? "",
    place: initial?.place ?? "",
    rsvpDeadline: initial?.rsvpDeadline ?? "",
  }));
  // 締切を自分で変えたか（変えていなければ、開催日に合わせて「前日」に追従する）
  const [deadlineTouched, setDeadlineTouched] = useState(!!initial?.rsvpDeadline);
  const [existing, setExisting] = useState<NoticeAttachment[]>(initial?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // 231: 「貼るもの」の欄全体にファイルを落とせる。持ってきている間は枠と色を変える
  const [dragOver, setDragOver] = useState(false);
  // 欄の外に落としてもブラウザがファイルを開かない（書きかけの題名・本文が消えない）
  usePreventWindowFileDrop();
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const total = existing.length + files.length;
  const set = <K extends keyof NoticeFormValue>(k: K, val: NoticeFormValue[K]) => setV((p) => ({ ...p, [k]: val }));

  const setHeldOn = (d: string) =>
    setV((p) => ({ ...p, heldOn: d, rsvpDeadline: deadlineTouched ? p.rsvpDeadline : defaultRsvpDeadline(d) }));

  const fileProblems = useMemo(
    () =>
      files
        .map((f) => {
          if (!attachmentKindOf(f.type, f.name)) return `「${f.name}」は貼れない種類です（画像・PDF・Wordだけ）`;
          // 画像は端末で縮めるので、ここでは PDF・Word の大きさだけを見る
          if (attachmentKindOf(f.type, f.name) !== "image" && f.size > NOTICE_FILE_MAX_BYTES) {
            return `「${f.name}」は${formatBytes(f.size)}あります（1ファイル${formatBytes(NOTICE_FILE_MAX_BYTES)}まで）`;
          }
          return "";
        })
        .filter(Boolean),
    [files]
  );

  // 「📎 ファイルを選ぶ」とドラッグ＆ドロップは、どちらもここを通す（231 §1: 確かめることと処理は同じ道）
  const pick = (list: FileList | File[] | null) => {
    if (!list) return;
    const all = Array.from(list);
    if (all.length === 0) return;
    const room = NOTICE_FILE_MAX_COUNT - total;
    const add = all.slice(0, Math.max(0, room));
    if (all.length > add.length) setErrors([`1件に貼れるのは${NOTICE_FILE_MAX_COUNT}ファイルまでです`]);
    setFiles((p) => [...p, ...add]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeExisting = async (a: NoticeAttachment) => {
    if (!initial) return;
    if (!window.confirm(`「${a.name}」を外します。元に戻せません。よろしいですか？`)) return;
    try {
      const r = await removeNoticeFile(initial.id, a.path);
      setExisting(r.notice.attachments);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "外せませんでした"]);
    }
  };

  const submit = async () => {
    setErrors([]);
    if (!v.title.trim()) return setErrors(["題名を入れてください"]);
    if (v.kind === "event" && !v.heldOn) return setErrors(["開催日を入れてください"]);
    if (fileProblems.length > 0) return setErrors(fileProblems);
    setBusy(true);
    try {
      const saved = initial ? (await updateNotice(initial.id, v)).notice : (await createNotice(v)).notice;
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`ファイルを送っています（${i + 1}/${files.length}）…`);
        try {
          await uploadNoticeFile(saved.id, files[i]);
        } catch (e) {
          failed.push(e instanceof Error ? e.message : `「${files[i].name}」を送れませんでした`);
        }
      }
      setProgress("");
      // 本文は保存済み。送れなかったファイルは開いた先で知らせる（「直す」から貼り直せる）
      onDone(
        saved.id,
        failed.length > 0 ? [`${initial ? "直しました" : "つくりました"}が、貼れなかったファイルがあります。「直す」から貼り直せます。`, ...failed] : []
      );
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "保存できませんでした"]);
      setProgress("");
      setBusy(false);
    }
  };

  const label = "block text-xs font-medium text-gray-700 mb-1";
  const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-h-[40px]";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4" data-notice-form>
      <p className="text-sm font-bold text-gray-900">{initial ? "✏️ 直す" : "＋ お知らせ・イベントをつくる"}</p>

      {!initial && (
        <div className="flex gap-2" role="radiogroup" aria-label="種類">
          {(
            [
              ["notice", "📣 お知らせ"],
              ["event", "🎉 イベント（出欠をとる）"],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.kind === k}
              onClick={() => set("kind", k)}
              className={`min-h-[40px] flex-1 rounded-lg border px-3 text-sm ${
                v.kind === k ? "border-teal-600 bg-teal-50 font-medium text-teal-800" : "border-gray-300 text-gray-700"
              }`}
              data-notice-kind={k}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div>
        <label className={label} htmlFor="notice-title">題名</label>
        <input id="notice-title" className={input} maxLength={NOTICE_TITLE_MAX} value={v.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="notice-body">本文</label>
        <textarea
          id="notice-body"
          className={`${input} min-h-[140px]`}
          maxLength={NOTICE_BODY_MAX}
          value={v.body}
          onChange={(e) => set("body", e.target.value)}
        />
      </div>

      {v.kind === "event" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="notice-held-on">開催日</label>
            <input id="notice-held-on" type="date" className={input} value={v.heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </div>
          <div>
            <span className={label}>開始の時刻（任意）</span>
            <TimeSelect value={v.heldTime} onChange={(t) => set("heldTime", t)} allowEmpty testId="notice-held-time" ariaLabel="開始の時刻の" />
          </div>
          <div>
            <label className={label} htmlFor="notice-place">場所（任意）</label>
            <input id="notice-place" className={input} maxLength={100} value={v.place} onChange={(e) => set("place", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="notice-deadline">出欠の締切（初期値は開催日の前日）</label>
            <input
              id="notice-deadline"
              type="date"
              className={input}
              value={v.rsvpDeadline}
              max={v.heldOn || undefined}
              onChange={(e) => {
                setDeadlineTouched(true);
                set("rsvpDeadline", e.target.value);
              }}
            />
          </div>
        </div>
      )}

      <div
        className={`space-y-2 rounded-lg border-2 border-dashed p-2 -m-2 transition-colors ${
          dragOver ? "border-teal-500 bg-teal-50" : "border-transparent"
        } ${busy ? "pointer-events-none" : ""}`}
        data-notice-dropzone
        data-over={dragOver ? "1" : "0"}
        onDragEnter={(e) => {
          if (busy || !isFileDrag(e)) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          if (busy || !isFileDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          // 欄の中の部品へ移っただけなら消さない
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          pick(e.dataTransfer.files);
        }}
      >
        <p className={label}>
          貼るもの（画像・PDF・Word／1ファイル{formatBytes(NOTICE_FILE_MAX_BYTES)}まで・{NOTICE_FILE_MAX_COUNT}ファイルまで）
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          画像は本文の中にそのまま出ます。写真の位置情報などは消してから保存します。iPhoneの写真（HEIC）も表示できる形にします。
        </p>
        {existing.length + files.length > 0 && (
          <ul className="space-y-1">
            {existing.map((a) => (
              <li key={a.path} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">{KIND_ICON[a.kind]} {a.name}<span className="ml-1 text-gray-400">{formatBytes(a.size)}</span></span>
                <button type="button" onClick={() => removeExisting(a)} className="shrink-0 text-red-600 underline">外す</button>
              </li>
            ))}
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  {KIND_ICON[attachmentKindOf(f.type, f.name) ?? ""] ?? "📎"} {f.name}
                  <span className="ml-1 text-gray-400">{formatBytes(f.size)}・保存すると送ります</span>
                </span>
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="shrink-0 text-gray-600 underline">
                  取り消す
                </button>
              </li>
            ))}
          </ul>
        )}
        {dragOver ? (
          <p className="text-[12px] font-medium text-teal-800">{DROP_HERE_TEXT}</p>
        ) : (
          total < NOTICE_FILE_MAX_COUNT && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-dashed border-teal-400 px-3 text-sm text-teal-800">
                📎 ファイルを選ぶ
                <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files)} data-notice-file-input />
              </label>
              {/* 186の文をそのまま使う（パソコンだけ。スマホはドラッグできないので出さない） */}
              <span className="hidden text-[11px] text-gray-500 sm:inline">{DROP_GUIDE_TEXT}</span>
            </div>
          )
        )}
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {progress && <p className="text-xs text-teal-700">{progress}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="min-h-[44px] rounded-lg bg-teal-700 px-5 text-sm font-medium text-white disabled:opacity-50"
          data-notice-submit
        >
          {busy ? "保存中…" : initial ? "直して保存" : "つくる"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-[44px] rounded-lg border border-gray-300 px-4 text-sm text-gray-700">
          やめる
        </button>
      </div>
    </div>
  );
}
