"use client";

// 学びの記録の一覧（指示書179 B）。本人ページ（C）と管理者のカルテ（A）で共用。
// - 再受講回数は attendanceCounts で読むたびに数える（保存しない・B-2）
// - 証跡は署名URL（1時間）で表示。追加・削除は専用API
// - 「次にやること → 目標に移す」は本人ページでだけ出す（onMoveToGoal を渡したとき）

import { useMemo, useRef, useState } from "react";
import {
  attendanceCounts,
  attendanceLabel,
  courseCategoryLabel,
  formatDates,
  sortLearningDesc,
  venueTypeLabel,
  type Course,
  type LearningRecord,
} from "@/lib/staff-growth";
import { PHOTO_MAX_EDGE, resizeImageToJpeg } from "@/lib/image-resize";

export function LearningRecordList({
  records,
  courses,
  canEdit,
  busy,
  bucketMissing,
  editingId,
  renderEditor,
  onEdit,
  onDelete,
  onUploadEvidence,
  onDeleteEvidence,
  onMoveToGoal,
}: {
  records: LearningRecord[];
  courses: Course[];
  canEdit: boolean;
  busy: boolean;
  bucketMissing: boolean;
  /** 編集中の記録id（その行にはフォームを出す） */
  editingId: string;
  renderEditor: (record: LearningRecord) => React.ReactNode;
  onEdit: (record: LearningRecord) => void;
  onDelete: (record: LearningRecord) => void;
  onUploadEvidence: (record: LearningRecord, files: Blob[]) => Promise<void>;
  onDeleteEvidence: (record: LearningRecord, path: string) => Promise<void>;
  onMoveToGoal?: (record: LearningRecord) => void;
}) {
  const counts = useMemo(() => attendanceCounts(records), [records]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const sorted = useMemo(() => sortLearningDesc(records), [records]);
  const [expanded, setExpanded] = useState("");

  if (sorted.length === 0) {
    return <p className="text-xs text-gray-600">まだ学びの記録がありません。</p>;
  }

  return (
    <ul className="space-y-2">
      {sorted.map((r) => {
        const course = courseMap.get(r.courseId);
        const nth = attendanceLabel(counts.get(r.id));
        const open = expanded === r.id;
        if (editingId === r.id) {
          return (
            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3">
              {renderEditor(r)}
            </li>
          );
        }
        return (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(open ? "" : r.id)}
              className="w-full text-left px-3 py-2.5 min-h-[52px] flex items-center justify-between gap-2 hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="text-[11px] text-gray-500">📅 {formatDates(r.dates)}</span>
                <span className="block text-sm font-medium text-gray-900 truncate">
                  {course?.name ?? "（講座不明）"}
                  {nth && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      {nth}
                    </span>
                  )}
                  {course?.status === "unconfirmed" && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      未確認の講座
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-gray-600 truncate">
                  {[venueTypeLabel(r.venueType), r.venueName].filter(Boolean).join(" ")}
                  {course?.category ? ` ・ ${courseCategoryLabel(course.category)}` : ""}
                  {r.evidence.length > 0 ? ` ・ 証跡${r.evidence.length}枚` : ""}
                </span>
              </span>
              <span className="text-xs text-gray-400 shrink-0">{open ? "▲" : "▼"}</span>
            </button>

            {open && (
              <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2 text-[12px] leading-relaxed">
                {course?.organizer && <Row label="主催" value={course.organizer} />}
                <Row label="学んだこと" value={r.learned} />
                <Row label="次にやること" value={r.nextAction} />
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <EvidenceBlock
                  record={r}
                  canEdit={canEdit}
                  busy={busy}
                  bucketMissing={bucketMissing}
                  onUpload={onUploadEvidence}
                  onDelete={onDeleteEvidence}
                />

                {(canEdit || onMoveToGoal) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {onMoveToGoal && r.nextAction.trim() && (
                      <button
                        type="button"
                        onClick={() => onMoveToGoal(r)}
                        disabled={busy}
                        className="px-3 py-2 border border-violet-300 text-violet-800 rounded-full text-xs hover:bg-violet-50 disabled:opacity-40 min-h-[40px]"
                      >
                        🎯 「次にやること」を目標に移す
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          disabled={busy}
                          className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[40px]"
                        >
                          ✏️ 編集
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(r)}
                          disabled={busy}
                          className="px-3 py-2 border border-red-300 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[40px]"
                        >
                          🗑 削除
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-gray-900 whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function EvidenceBlock({
  record,
  canEdit,
  busy,
  bucketMissing,
  onUpload,
  onDelete,
}: {
  record: LearningRecord;
  canEdit: boolean;
  busy: boolean;
  bucketMissing: boolean;
  onUpload: (record: LearningRecord, files: Blob[]) => Promise<void>;
  onDelete: (record: LearningRecord, path: string) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr("");
    try {
      const blobs: Blob[] = [];
      for (const f of Array.from(files)) blobs.push(await resizeImageToJpeg(f, PHOTO_MAX_EDGE));
      await onUpload(record, blobs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500">証跡（受講証・メモの画像）</p>
      {bucketMissing && record.evidence.length > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          証跡の保管庫（Storageバケット growth-evidence）がまだ作られていないため、画像を表示できません。
        </p>
      )}
      {record.evidence.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {record.evidence.map((e) => (
            <li key={e.path} className="relative">
              {e.signedUrl ? (
                <a href={e.signedUrl} target="_blank" rel="noopener noreferrer">
                  {/* 署名URLは1時間で切れるため next/image の最適化を通さない */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.signedUrl}
                    alt={e.name}
                    className="h-20 w-20 object-cover rounded-md border border-gray-200"
                  />
                </a>
              ) : (
                <div className="h-20 w-20 rounded-md border border-dashed border-gray-300 text-[10px] text-gray-500 flex items-center justify-center text-center p-1">
                  表示できません
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("この証跡を削除します。よろしいですか？")) return;
                    void onDelete(record, e.path);
                  }}
                  disabled={busy}
                  aria-label="証跡を削除"
                  className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-white border border-gray-300 text-[11px] text-red-700 shadow"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            multiple
            disabled={busy || uploading}
            onChange={(e) => void pick(e.target.files)}
            className="text-xs"
          />
          {uploading && <p className="text-[11px] text-gray-600">アップロード中…</p>}
          {err && <p className="text-[11px] text-red-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
