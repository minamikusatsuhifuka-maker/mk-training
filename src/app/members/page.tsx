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
  loadAllStaffProfiles,
  type StaffProfile,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";
import {
  loadProfileFieldConfig,
  visibleProfileFields,
  type ProfileFieldDef,
} from "@/lib/profile-fields";
import {
  BASIC_CARD_FIELDS,
  DEFAULT_MEMBERS_CARD_CONFIG,
  MAX_CARD_FIELDS_SHOWN,
  loadMembersCardConfig,
  type MembersCardConfig,
} from "@/lib/members-card";

function Avatar({
  url,
  name,
  size,
}: {
  url?: string;
  name: string;
  size: "sm" | "lg" | "xl";
}) {
  const cls =
    size === "sm"
      ? "h-16 w-16 text-2xl"
      : size === "lg"
        ? "h-20 w-20 text-3xl"
        : "h-24 w-24 text-4xl";
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
  const [fieldDefs, setFieldDefs] = useState<ProfileFieldDef[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StaffProfile>>({});
  const [cardConfig, setCardConfig] = useState<MembersCardConfig>(
    DEFAULT_MEMBERS_CARD_CONFIG
  );

  useEffect(() => {
    loadProfilesIndex()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoaded(true));
    // カード表示用: プロフィール本体（1クエリ一括）・カスタム項目定義・カード設定
    loadAllStaffProfiles()
      .then(setProfiles)
      .catch(() => {});
    loadProfileFieldConfig()
      .then((defs) => setFieldDefs(visibleProfileFields(defs)))
      .catch(() => {});
    loadMembersCardConfig()
      .then(setCardConfig)
      .catch(() => {});
  }, []);

  const openDetail = async (entry: StaffProfileIndexEntry) => {
    // 一括取得済みならそれを使い、無ければ従来どおり個別取得
    const cached = profiles[entry.userId];
    if (cached) {
      setSelected(cached);
      return;
    }
    setDetailLoading(true);
    const p = await loadStaffProfile(entry.userId).catch(() => null);
    setDetailLoading(false);
    if (p) setSelected(p);
  };

  // カードに表示する項目（設定の順序で、ラベルを解決できたものだけ）
  const cardFields = cardConfig.fieldIds
    .map((id) => {
      const basic = BASIC_CARD_FIELDS.find((f) => f.id === id);
      if (basic) return basic;
      const def = fieldDefs.find((f) => f.id === id);
      return def ? { id: def.id, label: def.label } : null;
    })
    .filter((f): f is { id: string; label: string } => f !== null);

  // 1人分のカードに載せる項目値（値が空のものは出さない・最大N個）
  const cardValuesOf = (userId: string): { id: string; label: string; value: string }[] => {
    const p = profiles[userId];
    if (!p) return [];
    const values: { id: string; label: string; value: string }[] = [];
    for (const f of cardFields) {
      if (values.length >= MAX_CARD_FIELDS_SHOWN) break;
      const v =
        f.id === "bio"
          ? p.bio
          : f.id === "hobbies"
            ? p.hobbies
            : (p.customFields?.[f.id] ?? "");
      if (v.trim()) values.push({ id: f.id, label: f.label, value: v });
    }
    return values;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {members.map((m) => {
            const values = cardValuesOf(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => openDetail(m)}
                disabled={detailLoading}
                className="rounded-xl border border-border bg-card p-5 text-left hover:bg-accent transition-colors space-y-3"
              >
                <div className="flex items-center gap-4">
                  <Avatar url={m.avatarUrl} name={m.name} size="xl" />
                  <div className="min-w-0">
                    {cardConfig.showKana && m.kana && (
                      <p className="text-xs text-muted-foreground truncate">
                        {m.kana}
                      </p>
                    )}
                    <p className="text-lg font-bold truncate">{m.name}</p>
                    {cardConfig.showRole && m.role && (
                      <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full bg-teal-light text-teal">
                        {m.role}
                      </span>
                    )}
                  </div>
                </div>
                {cardConfig.showMessage && m.message && (
                  <p className="text-sm bg-teal-light/40 rounded-md px-3 py-1.5 line-clamp-2">
                    💬 {m.message}
                  </p>
                )}
                {values.length > 0 && (
                  <dl className="space-y-1.5">
                    {values.map((v) => (
                      <div key={v.id}>
                        <dt className="text-[11px] font-semibold text-muted-foreground">
                          {v.label}
                        </dt>
                        <dd className="text-sm line-clamp-2 whitespace-pre-wrap">
                          {v.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </button>
            );
          })}
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

              {/* カスタム項目（値が入っているものだけ表示） */}
              {fieldDefs
                .filter((f) => (selected.customFields?.[f.id] ?? "").trim())
                .map((f) => (
                  <div key={f.id}>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-1">
                      {f.label}
                    </h3>
                    <p className="text-sm whitespace-pre-wrap">
                      {selected.customFields[f.id]}
                    </p>
                  </div>
                ))}

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
