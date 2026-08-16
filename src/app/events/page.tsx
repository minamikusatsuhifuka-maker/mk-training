"use client";

// 🎪 イベント（指示書132-A・機能ID events）
// - 行事・思い出の記録（勉強会アーカイブ=学びの記録とは別機能）。
// - 閲覧は全スタッフ・投稿/編集は指定メンバー＋管理者のみ（サーバー側 /api/events で強制。
//   UIの出し分けはAPIの canEdit フラグに従うだけで、権限の実体はサーバー側）。
// - 一覧は開催日降順＋年ごとの区切り見出し。資料は資料庫docId参照（実体1つ）。
// - 写真ギャラリーは132-Bで追加（本ページはその土台のみ）。

import { useState, useEffect, useCallback, useMemo } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { LibraryDocPicker } from "@/components/LibraryDocPicker";
import { loadPortalObject } from "@/lib/portal-store";
import {
  LIBRARY_KEY,
  normalizeStore as normalizeLibraryStore,
  type LibraryDoc,
} from "@/lib/library";
import {
  fetchEvents,
  createEvent,
  updateEvent,
  uploadEventPhotos,
  removeEventPhoto,
  groupEventsByYear,
  type ClinicEvent,
  type EventLibraryRef,
} from "@/lib/clinic-events";
import { jstTodayYmd } from "@/lib/library";
import { resizeImageToJpeg, PHOTO_MAX_EDGE } from "@/lib/image-resize";

// 開催日「2026/8/3（月）」（TZ非依存・カレンダーページと同じ流儀）
function formatHeldOn(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, da] = m;
  const week = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da))).getUTCDay()
  ];
  return `${y}/${Number(mo)}/${Number(da)}（${week}）`;
}

function EventsPageBody() {
  const [events, setEvents] = useState<ClinicEvent[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 写真の保管庫が未作成（165）。編集できる人にだけ出す＝直せる人にだけ伝える。
  const [photoBucketMissing, setPhotoBucketMissing] = useState(false);

  // 資料チップ表示用（タイトル解決・LibraryDocPicker と同じ anon 直読み）
  const [libraryDocs, setLibraryDocs] = useState<LibraryDoc[]>([]);

  // フォーム（新規/編集共用・編集メンバーのみ表示）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [heldOn, setHeldOn] = useState(jstTodayYmd());
  const [description, setDescription] = useState("");
  const [refs, setRefs] = useState<EventLibraryRef[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 写真（132-B）: アップロード中のイベントID・ライトボックス（イベントID＋表示中index）
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    eventId: string;
    index: number;
  } | null>(null);

  // 写真アップロード（送信前に既存libで長辺1600px・JPEGに圧縮）
  const handlePhotoUpload = async (ev: ClinicEvent, files: FileList) => {
    if (uploadingId) return;
    setUploadingId(ev.id);
    setError("");
    try {
      const blobs: Blob[] = [];
      for (const f of Array.from(files).slice(0, 20)) {
        try {
          blobs.push(await resizeImageToJpeg(f, PHOTO_MAX_EDGE, 0.8));
        } catch {
          blobs.push(f); // 圧縮不能な形式は元ファイル送信（サーバー側8MB上限で強制）
        }
      }
      const updated = await uploadEventPhotos(ev.id, blobs);
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真の追加に失敗しました");
    } finally {
      setUploadingId(null);
    }
  };

  // 写真の付け外し（実体も即削除・復元不可を明示）
  const handlePhotoRemove = async (ev: ClinicEvent, path: string) => {
    if (uploadingId) return;
    if (!confirm("この写真を外しますか？（実体ファイルも削除され、元に戻せません）")) {
      return;
    }
    setUploadingId(ev.id);
    setError("");
    try {
      const updated = await removeEventPhoto(ev.id, path);
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)));
      setLightbox(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真の削除に失敗しました");
    } finally {
      setUploadingId(null);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetchEvents();
      setEvents(res.events);
      setCanEdit(res.canEdit);
      setPhotoBucketMissing(res.photoBucketMissing === true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    loadPortalObject<unknown>(LIBRARY_KEY, null)
      .then((raw) => setLibraryDocs(normalizeLibraryStore(raw).docs))
      .catch(() => {});
  }, [refresh]);

  const docTitle = useMemo(() => {
    const map = new Map(libraryDocs.map((d) => [d.id, d.title]));
    return (docId: string) => map.get(docId) ?? "";
  }, [libraryDocs]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setHeldOn(jstTodayYmd());
    setDescription("");
    setRefs([]);
    setShowPicker(false);
  };

  const startEdit = (ev: ClinicEvent) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setHeldOn(ev.heldOn);
    setDescription(ev.description);
    setRefs(ev.libraryRefs);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!title.trim() || !heldOn || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (editingId) {
        const updated = await updateEvent(editingId, {
          title: title.trim(),
          heldOn,
          description,
          libraryRefs: refs,
        });
        setEvents((prev) =>
          prev.map((e) => (e.id === editingId ? updated : e))
        );
      } else {
        const created = await createEvent({
          title: title.trim(),
          heldOn,
          description,
          libraryRefs: refs,
        });
        setEvents((prev) => [created, ...prev]);
      }
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const groups = groupEventsByYear(events);

  if (loading) {
    return (
      <p className="text-sm text-gray-500 py-16 text-center animate-pulse">
        読み込んでいます…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed bg-orange-50/60 border border-orange-100 rounded-xl px-4 py-3">
        懇親会・周年行事・外部セミナー参加などの行事を、クリニックの歴史として記録する場所です。使用した資料や写真は後日の追加もできます。
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* 写真の保管庫が未作成（165）。アップロードする前に、直せる人にだけ理由を出す。 */}
      {photoBucketMissing && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
          ⚠️ 写真の保管庫（Storageバケット <code>event-photos</code>）がまだ作られていません。
          このままだと写真の追加に失敗します。Supabase の SQL Editor で、
          指示書165で交付したSQL（165_event-photos_バケット作成.sql）を実行してください。
          イベントの記録・編集・資料の紐づけは、この状態でも使えます。
        </p>
      )}

      {/* 投稿・編集フォーム（指定メンバー＋管理者のみ。権限の実体はサーバー側） */}
      {canEdit && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">
            {editingId ? "✏️ イベントを編集" : "＋ イベントを記録"}
          </h2>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs text-gray-600 space-y-1 flex-1 min-w-[220px]">
              <span className="block font-medium">タイトル（必須）</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 5周年記念 納涼会"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600 space-y-1">
              <span className="block font-medium">開催日（必須）</span>
              <input
                type="date"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <label className="text-xs text-gray-600 space-y-1 block">
            <span className="block font-medium">説明文</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="どんなイベントだったか・参加した学び・思い出など"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </label>

          {/* 資料（資料庫docId参照・実体は資料庫の1ファイル） */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-gray-600">
              資料（資料庫から選択・後日追加可）
            </span>
            {refs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {refs.map((r) => (
                  <span
                    key={r.docId}
                    className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-800 border border-sky-100 rounded-full px-2 py-0.5"
                  >
                    📄 {docTitle(r.docId) || "（資料庫から削除済み）"}
                    <button
                      type="button"
                      onClick={() =>
                        setRefs((prev) =>
                          prev.filter((x) => x.docId !== r.docId)
                        )
                      }
                      className="text-sky-500 hover:text-red-500"
                      aria-label="この資料を外す"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-600"
            >
              {showPicker ? "▲ 選択を閉じる" : "📄 資料庫から選ぶ"}
            </button>
            {showPicker && (
              <LibraryDocPicker
                onPick={(doc) =>
                  setRefs((prev) =>
                    prev.some((x) => x.docId === doc.id)
                      ? prev
                      : [...prev, { docId: doc.id }]
                  )
                }
                excludeIds={refs.map((r) => r.docId)}
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm px-3 py-2 text-gray-500 hover:text-gray-700"
              >
                キャンセル
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || !heldOn || submitting}
              className="text-sm px-4 py-2 bg-orange-600 text-white rounded-full hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? "保存中…" : editingId ? "更新する" : "🎪 記録する"}
            </button>
          </div>
        </div>
      )}

      {/* 一覧（開催日降順・年ごとの区切り見出し） */}
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          まだイベントの記録がありません。
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.year} className="space-y-2">
              <h2 className="text-sm font-bold text-gray-500 border-b border-gray-200 pb-1">
                {g.year}年
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {g.items.length}件
                </span>
              </h2>
              {g.items.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[10px] font-medium bg-orange-100 text-orange-800 rounded-full px-2 py-0.5 shrink-0">
                        📅 {formatHeldOn(ev.heldOn)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 break-words">
                        {ev.title}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEdit(ev)}
                        className="text-xs px-2 py-1 text-gray-500 hover:text-orange-600 shrink-0"
                      >
                        ✏️ 編集
                      </button>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {ev.description}
                    </p>
                  )}
                  {ev.libraryRefs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ev.libraryRefs.map((r) => {
                        const t = docTitle(r.docId);
                        return t ? (
                          <a
                            key={r.docId}
                            href={`/library?doc=${encodeURIComponent(r.docId)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-800 border border-sky-100 rounded-full px-2 py-0.5 hover:bg-sky-100"
                          >
                            📄 {t} ↗
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}

                  {/* 写真ギャラリー（132-B・署名URL表示・タップで拡大） */}
                  {(ev.photos.length > 0 || canEdit) && (
                    <div className="space-y-1.5">
                      {ev.photos.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                          {ev.photos.map((p, idx) =>
                            p.signedUrl ? (
                              <div key={p.path} className="relative group">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.signedUrl}
                                  alt={`${ev.title} の写真`}
                                  loading="lazy"
                                  onClick={() =>
                                    setLightbox({ eventId: ev.id, index: idx })
                                  }
                                  className="aspect-square w-full object-cover rounded-lg cursor-zoom-in bg-gray-100"
                                />
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handlePhotoRemove(ev, p.path)}
                                    disabled={uploadingId === ev.id}
                                    aria-label="この写真を外す"
                                    /* スマートフォンには hover が無く opacity-0 のままだと押せない。
                                       常時うっすら出して、PCではホバーではっきりさせる（165 §4-1）。
                                       タップ領域も指で押せる大きさ（28px）にする。 */
                                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-[11px] leading-none opacity-70 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : null
                          )}
                        </div>
                      )}
                      {canEdit && (
                        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 cursor-pointer">
                          {uploadingId === ev.id
                            ? "アップロード中…"
                            : "📷 写真を追加（複数可）"}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            disabled={uploadingId === ev.id}
                            onChange={(e) => {
                              if (e.target.files?.length) {
                                handlePhotoUpload(ev, e.target.files);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* 簡易ライトボックス（132-B・前後送り＋閉じる。fixed系のため最上位に配置） */}
      {(() => {
        if (!lightbox) return null;
        const ev = events.find((e) => e.id === lightbox.eventId);
        const photos = (ev?.photos ?? []).filter((p) => p.signedUrl);
        const photo = photos[lightbox.index];
        if (!ev || !photo) return null;
        const move = (d: number) =>
          setLightbox({
            eventId: ev.id,
            index: (lightbox.index + d + photos.length) % photos.length,
          });
        return (
          <div
            className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-label="写真の拡大表示"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.signedUrl}
              alt={`${ev.title} の写真 ${lightbox.index + 1}/${photos.length}`}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="閉じる"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white text-lg hover:bg-white/30"
            >
              ✕
            </button>
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(-1);
                  }}
                  aria-label="前の写真"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white text-lg hover:bg-white/30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(1);
                  }}
                  aria-label="次の写真"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white text-lg hover:bg-white/30"
                >
                  →
                </button>
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs tabular-nums">
                  {lightbox.index + 1} / {photos.length}
                </span>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default function EventsPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader
        navKey="/events"
        title="🎪 イベント"
        description="行事・思い出をクリニックの歴史として記録"
      />
      <FeatureGate feature="events">
        <EventsPageBody />
      </FeatureGate>
    </div>
  );
}
