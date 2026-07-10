"use client";

// メンバー紹介（閲覧は誰でも可・ログイン不要）
// 一覧: staff_profiles_index ／ 詳細: staff_profile:<userId>（クリックで読み込み）

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  Quote,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
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
  defaultCardFieldIds,
  loadMembersCardConfigOrNull,
  type MembersCardConfig,
} from "@/lib/members-card";

// 役職→ロールカラー（淡背景＋濃文字。Tailwindリテラルクラスで定義しpurge回避・動的組み立て禁止）
type RoleColor = { bg: string; text: string; border: string };
const ROLE_COLORS: Record<string, RoleColor> = {
  受付: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  クラーク: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    border: "border-violet-300",
  },
  医療クラーク: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-300",
  },
  看護師: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
  },
  カウンセラー: {
    bg: "bg-rose-100",
    text: "text-rose-700",
    border: "border-rose-300",
  },
  その他: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" },
};

function roleColorOf(role?: string): RoleColor {
  return (role && ROLE_COLORS[role]) || ROLE_COLORS["その他"];
}

// fieldId→ラベル用アイコン（未知の項目は Sparkles）
const FIELD_ICONS: Record<string, LucideIcon> = {
  nickname: Tag,
  hometown: MapPin,
  favorite_food: UtensilsCrossed,
  holiday: Sun,
  hooked: Flame,
  strength: Star,
  proud: Trophy,
  motto: Quote,
  manual: BookOpen,
  talk_ok: MessageCircle,
  bio: FileText,
  hobbies: Heart,
};

function fieldIconOf(id: string): LucideIcon {
  return FIELD_ICONS[id] ?? Sparkles;
}

function Avatar({
  url,
  name,
  role,
  size,
}: {
  url?: string;
  name: string;
  role?: string;
  size: "card" | "lg";
}) {
  // card=72px（一覧カード）／lg=80px（詳細ダイアログ）
  const cls = size === "card" ? "h-[72px] w-[72px]" : "h-20 w-20";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`${cls} rounded-full object-cover border border-gray-200 shrink-0`}
      />
    );
  }
  const c = roleColorOf(role);
  return (
    <div
      className={`${cls} rounded-full ${c.bg} ${c.text} text-2xl font-medium flex items-center justify-center shrink-0`}
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
    // 項目定義とカード設定は同時に解決する（未保存時の既定=全項目 を組み立てるため）
    Promise.all([loadProfileFieldConfig(), loadMembersCardConfigOrNull()])
      .then(([defs, cfg]) => {
        const visible = visibleProfileFields(defs);
        setFieldDefs(visible);
        setCardConfig(
          cfg ?? {
            ...DEFAULT_MEMBERS_CARD_CONFIG,
            // 未保存なら「全カスタム項目＋自己紹介・趣味特技」＝書いたものは全部出る
            fieldIds: defaultCardFieldIds(visible.map((f) => f.id)),
          }
        );
      })
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
  // long=true は長文になりがちな項目（自己紹介/趣味特技/textarea項目）→ 2行line-clamp表示
  type CardField = { id: string; label: string; long: boolean };
  const cardFields: CardField[] = cardConfig.fieldIds
    .map((id) => {
      const basic = BASIC_CARD_FIELDS.find((f) => f.id === id);
      if (basic) return { ...basic, long: true };
      const def = fieldDefs.find((f) => f.id === id);
      return def
        ? { id: def.id, label: def.label, long: def.type === "textarea" }
        : null;
    })
    .filter((f): f is CardField => f !== null);

  // 1人分のカードに載せる項目値（値が空のものは出さない・入力済みはすべて表示）
  const cardValuesOf = (
    userId: string
  ): { id: string; label: string; value: string; long: boolean }[] => {
    const p = profiles[userId];
    if (!p) return [];
    const values: { id: string; label: string; value: string; long: boolean }[] =
      [];
    for (const f of cardFields) {
      const v =
        f.id === "bio"
          ? p.bio
          : f.id === "hobbies"
            ? p.hobbies
            : (p.customFields?.[f.id] ?? "");
      if (v.trim())
        values.push({ id: f.id, label: f.label, value: v, long: f.long });
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 items-start">
          {members.map((m) => {
            const values = cardValuesOf(m.userId);
            const c = roleColorOf(m.role);
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => openDetail(m)}
                disabled={detailLoading}
                className="@container flex flex-col gap-3.5 rounded-2xl border border-gray-200 bg-white p-6 text-left transition hover:border-gray-300 hover:shadow-sm"
              >
                {/* ヘッダー: アバター＋名前ブロック */}
                <div className="flex items-center gap-3.5">
                  <Avatar url={m.avatarUrl} name={m.name} role={m.role} size="card" />
                  <div className="min-w-0">
                    {cardConfig.showKana && m.kana && (
                      <p className="text-xs text-gray-400 truncate">{m.kana}</p>
                    )}
                    <p className="text-lg font-medium text-gray-900 truncate">
                      {m.name}
                    </p>
                    {cardConfig.showRole && m.role && (
                      <span
                        className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full ${c.bg} ${c.text}`}
                      >
                        {m.role}
                      </span>
                    )}
                  </div>
                </div>

                {/* ひとこと（引用風） */}
                {cardConfig.showMessage && m.message && (
                  <p
                    className={`text-sm text-gray-500 border-l-2 ${c.border} rounded-none pl-3 line-clamp-2`}
                  >
                    {m.message}
                  </p>
                )}

                {/* 項目ゾーン（入力済みはすべて表示。カード幅480px以上で2カラムに流す） */}
                {values.length > 0 && (
                  <dl className="grid grid-cols-1 @[480px]:grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
                    {values.map((v) => {
                      const Icon = fieldIconOf(v.id);
                      return (
                        <div key={v.id} className="flex items-start gap-2 min-w-0">
                          <dt className="flex min-w-[96px] max-w-[160px] flex-none items-center gap-1.5 text-[13px] text-gray-400">
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{v.label}</span>
                          </dt>
                          <dd
                            className={`min-w-0 flex-1 text-[13px] text-gray-800 ${
                              v.long
                                ? "line-clamp-2 whitespace-pre-wrap"
                                : "truncate"
                            }`}
                          >
                            {v.value}
                          </dd>
                        </div>
                      );
                    })}
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
              <div className="flex items-center gap-3.5">
                <Avatar
                  url={selected.avatarUrl}
                  name={selected.name}
                  role={selected.role}
                  size="lg"
                />
                <div className="min-w-0">
                  {selected.kana && (
                    <p className="text-xs text-gray-400">{selected.kana}</p>
                  )}
                  <p className="text-lg font-medium text-gray-900">
                    {selected.name}
                  </p>
                  {selected.role && (
                    <span
                      className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full ${roleColorOf(selected.role).bg} ${roleColorOf(selected.role).text}`}
                    >
                      {selected.role}
                    </span>
                  )}
                </div>
              </div>

              {selected.message && (
                <p
                  className={`text-sm text-gray-500 border-l-2 ${roleColorOf(selected.role).border} rounded-none pl-3`}
                >
                  {selected.message}
                </p>
              )}

              {selected.bio && (
                <div className="border-t border-gray-100 pt-3">
                  <h3 className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    自己紹介
                  </h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {selected.bio}
                  </p>
                </div>
              )}

              {selected.hobbies && (
                <div className="border-t border-gray-100 pt-3">
                  <h3 className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1">
                    <Heart className="h-3.5 w-3.5 shrink-0" />
                    趣味・特技
                  </h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {selected.hobbies}
                  </p>
                </div>
              )}

              {/* カスタム項目（値が入っているものだけ表示） */}
              {fieldDefs
                .filter((f) => (selected.customFields?.[f.id] ?? "").trim())
                .map((f) => {
                  const Icon = fieldIconOf(f.id);
                  return (
                    <div key={f.id} className="border-t border-gray-100 pt-3">
                      <h3 className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {f.label}
                      </h3>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {selected.customFields[f.id]}
                      </p>
                    </div>
                  );
                })}

              {selected.photos.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <h3 className="text-[13px] text-gray-400 mb-1.5">
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
