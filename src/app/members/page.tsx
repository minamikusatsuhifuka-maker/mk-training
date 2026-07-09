"use client";

// メンバー紹介（閲覧は誰でも可・ログイン不要）
// 一覧: staff_profiles_index ／ 詳細: staff_profile:<userId>（クリックで読み込み）

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadProfilesIndex,
  loadStaffProfile,
  type StaffProfile,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";

function Avatar({
  url,
  name,
  size,
}: {
  url?: string;
  name: string;
  size: "sm" | "lg";
}) {
  const cls =
    size === "sm"
      ? "h-16 w-16 text-2xl"
      : "h-20 w-20 text-3xl";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`${cls} rounded-full object-cover border border-border shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${cls} rounded-full bg-teal-light text-teal flex items-center justify-center shrink-0`}
    >
      {name ? name.charAt(0) : "👤"}
    </div>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<StaffProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadProfilesIndex()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const openDetail = async (entry: StaffProfileIndexEntry) => {
    setDetailLoading(true);
    const p = await loadStaffProfile(entry.userId).catch(() => null);
    setDetailLoading(false);
    if (p) setSelected(p);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="👥 メンバー紹介"
        description="南草津皮フ科で働くスタッフのプロフィール"
        badge={loaded ? `${members.length} 名` : undefined}
      />

      {!loaded ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : members.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-muted-foreground">
            まだプロフィールが登録されていません。
          </p>
          <p className="text-xs text-muted-foreground">
            アカウントをお持ちの方は
            <Link
              href="/profile"
              className="text-teal underline underline-offset-2 mx-0.5"
            >
              マイプロフィール
            </Link>
            から登録できます。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => openDetail(m)}
              disabled={detailLoading}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-colors"
            >
              <Avatar url={m.avatarUrl} name={m.name} size="sm" />
              <div className="min-w-0">
                {m.kana && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.kana}
                  </p>
                )}
                <p className="text-sm font-semibold truncate">{m.name}</p>
                {m.role && <p className="text-xs text-teal">{m.role}</p>}
                {m.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {m.message}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 個人詳細 */}
      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="sr-only">
                {selected.name} のプロフィール
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar
                  url={selected.avatarUrl}
                  name={selected.name}
                  size="lg"
                />
                <div>
                  {selected.kana && (
                    <p className="text-xs text-muted-foreground">
                      {selected.kana}
                    </p>
                  )}
                  <p className="text-lg font-bold">{selected.name}</p>
                  {selected.role && (
                    <p className="text-sm text-teal">{selected.role}</p>
                  )}
                </div>
              </div>

              {selected.message && (
                <p className="text-sm bg-teal-light/40 rounded-md px-3 py-2">
                  💬 {selected.message}
                </p>
              )}

              {selected.bio && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1">
                    自己紹介
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{selected.bio}</p>
                </div>
              )}

              {selected.hobbies && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1">
                    趣味・特技
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">
                    {selected.hobbies}
                  </p>
                </div>
              )}

              {selected.photos.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">
                    写真（{selected.photos.length}枚）
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.photos.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => setZoomPhoto(p.url)}
                        className="space-y-0.5 text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption || "写真"}
                          className="w-full aspect-square object-cover rounded-md border border-border"
                        />
                        {p.caption && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {p.caption}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 写真拡大 */}
      {zoomPhoto && (
        <Dialog open onOpenChange={(o) => !o && setZoomPhoto(null)}>
          <DialogContent className="max-w-2xl p-2">
            <DialogHeader>
              <DialogTitle className="sr-only">写真の拡大表示</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomPhoto}
              alt="拡大写真"
              className="w-full max-h-[75vh] object-contain rounded-md"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
