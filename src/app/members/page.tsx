"use client";

// メンバー紹介（閲覧は誰でも可・ログイン不要）
// 一覧: staff_profiles_index ／ 詳細: staff_profile:<userId>（クリックで読み込み）

import { Fragment, useEffect, useMemo, useState } from "react";
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
  isFieldPrivate,
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
import { useEffectiveColumns } from "@/lib/use-effective-columns";
import {
  DEFAULT_PORTAL_FEATURES,
  loadPortalFeatures,
  type PortalFeatures,
} from "@/lib/portal-features";
import { computeCommonPoints } from "@/lib/common-points";
import {
  DEFAULT_PROFILE_ROLES,
  loadProfileRoleConfig,
  resolveRole,
  type ProfileRoleDef,
  type RoleColorClasses,
} from "@/lib/profile-roles";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  NEEDS_GROUPS,
  NEED_GROUP_STYLE,
  hasSurveyContent,
  isPdfAsset,
  radarValuesOf,
} from "@/lib/needs-survey";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";
import {
  collectMemberAnswers,
  loadWeeklyQuestions,
  weekRangeLabel,
  type WeeklyHistoryItem,
  type WeeklyQuestionsData,
} from "@/lib/weekly-questions";

// 役職→ロールカラー・ラベルは profile_role_config（lib/profile-roles.ts）から解決する（指示書51）。
// 色クラスは ROLE_COLOR_CLASSES にリテラル定義（purge回避・動的組み立て禁止）。

// name がメールアドレスのままのユーザー対策: 画面上は @ 前のローカル部のみ表示する
// （データ自体の修正は本人の /profile 編集に委ねる。メールを意図的に表示する要素は置かない）
function displayName(name: string): string {
  return name.includes("@") ? name.split("@")[0] : name;
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
  colors,
  size,
}: {
  url?: string;
  name: string;
  /** 役職のロールカラー（resolveRole で解決済みのものを渡す） */
  colors: RoleColorClasses;
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
  const c = colors;
  return (
    <div
      className={`${cls} rounded-full ${c.bg} ${c.text} text-2xl font-medium flex items-center justify-center shrink-0`}
    >
      {name ? displayName(name).charAt(0) : "👤"}
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
  // 管理画面設定の列数を広い画面での最大値とし、狭い画面では自動で減らす（指示書45）
  const effectiveCols = useEffectiveColumns(cardConfig.columns);
  // 今週の質問の回答履歴（指示書47。機能スイッチOFF時はnullのまま＝非表示）
  const [weeklyData, setWeeklyData] = useState<WeeklyQuestionsData | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // 共通点バッジ（指示書46R-C。ログイン中＋自分のプロフィールがある場合のみ）
  const [features, setFeatures] = useState<PortalFeatures>(
    DEFAULT_PORTAL_FEATURES
  );
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // 役職の選択肢定義（ラベル・色の解決用。指示書51。失敗時は既定6役職）
  const [roleDefs, setRoleDefs] = useState<ProfileRoleDef[]>(
    DEFAULT_PROFILE_ROLES
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
    // 機能スイッチ＋今週の質問の回答履歴（スイッチONのときだけ読み込む）
    loadPortalFeatures()
      .then((f) => {
        setFeatures(f);
        if (f.weeklyQuestion) {
          loadWeeklyQuestions().then(setWeeklyData).catch(() => {});
        }
      })
      .catch(() => {});
    // 役職定義（ロールカラー・ラベル解決。指示書51）
    loadProfileRoleConfig()
      .then(setRoleDefs)
      .catch(() => {});
    // ログイン中ユーザー（共通点バッジの基準。未ログインなら非表示）
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => setMyUserId(data.user?.id ?? null))
      .catch(() => {});
  }, []);

  const openDetail = async (entry: StaffProfileIndexEntry) => {
    setShowAllHistory(false);
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
  // 🔒（customFieldsPrivacy=private）のカスタム項目は値があっても出さない（指示書52）。
  const cardValuesOf = (
    userId: string
  ): { id: string; label: string; value: string; long: boolean }[] => {
    const p = profiles[userId];
    if (!p) return [];
    const values: { id: string; label: string; value: string; long: boolean }[] =
      [];
    for (const f of cardFields) {
      if (f.id !== "bio" && f.id !== "hobbies" && isFieldPrivate(p, f.id))
        continue;
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

  // 今週の質問の回答履歴（id=userId優先、無ければname一致。新しい順）。指示書47
  const weeklyHistory =
    selected && weeklyData
      ? collectMemberAnswers(weeklyData, selected.userId, selected.name)
      : [];

  // カード表示用: 全メンバーの回答履歴を一括算出（指示書50。weekly_questions の
  // 読み込みは上の1回のみで、収集ロジックは詳細ダイアログと同じ collectMemberAnswers を共用）
  const weeklyAnswersByMember = useMemo(() => {
    const map: Record<string, WeeklyHistoryItem[]> = {};
    if (!weeklyData || !cardConfig.showWeeklyAnswers) return map;
    for (const m of members) {
      const items = collectMemberAnswers(weeklyData, m.userId, m.name);
      if (items.length > 0) map[m.userId] = items;
    }
    return map;
  }, [weeklyData, members, cardConfig.showWeeklyAnswers]);

  // 共通点（46R-C）: 自分のプロフィールがある場合のみ。他人カード・詳細で使用
  const myProfile =
    features.commonPoints && myUserId ? profiles[myUserId] : undefined;
  const labelOf = (id: string) => fieldDefs.find((f) => f.id === id)?.label;
  const commonPointsWith = (userId: string) => {
    if (!myProfile || userId === myUserId) return [];
    const other = profiles[userId];
    if (!other) return [];
    // 役職の一致判定は role の id 一致のまま（46R）。表示値だけラベルに解決する
    return computeCommonPoints(myProfile, other, labelOf).map((p) =>
      p.key === "role"
        ? { ...p, values: p.values.map((v) => resolveRole(roleDefs, v).label) }
        : p
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
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
        <div
          className="grid gap-4 items-start"
          style={{
            gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
          }}
        >
          {members.map((m) => {
            const values = cardValuesOf(m.userId);
            const common = commonPointsWith(m.userId);
            const weeklyAnswers = weeklyAnswersByMember[m.userId] ?? [];
            const roleMeta = resolveRole(roleDefs, m.role);
            const c = roleMeta.colors;
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
                  <Avatar url={m.avatarUrl} name={m.name} colors={c} size="card" />
                  <div className="min-w-0">
                    {cardConfig.showKana && m.kana && (
                      <p className="text-xs text-gray-400 truncate">{m.kana}</p>
                    )}
                    <p className="text-lg font-medium text-gray-900 truncate">
                      {displayName(m.name)}
                    </p>
                    {cardConfig.showRole && m.role && (
                      <span
                        className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full ${c.bg} ${c.text}`}
                      >
                        {roleMeta.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* あなたとの共通点バッジ（最大2個・ログイン中のみ）46R-C */}
                {common.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {common.slice(0, 2).map((cp) => (
                      <span
                        key={cp.key}
                        title={cp.values.join("、")}
                        className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                      >
                        🤝 共通点: {cp.label}
                      </span>
                    ))}
                  </div>
                )}

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

                {/* 💬 今週の質問より（最新2件・0件の人は非表示）指示書50。
                    weeklyData は weeklyQuestion ON のときだけ読み込まれるため機能スイッチと連動。
                    カード全体が詳細ダイアログへのボタンなので添え書きもクリックで詳細が開く。 */}
                {weeklyAnswers.length > 0 && (
                  <div className="w-full min-w-0 border-t border-gray-100 pt-3 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[13px] text-gray-400">
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      💬 今週の質問より
                    </p>
                    {weeklyAnswers.slice(0, 2).map((h) => (
                      <div key={`${h.weekKey}_${h.at}`} className="min-w-0">
                        <p className="text-xs text-gray-400 truncate">
                          {h.question ?? "（当時の質問）"}
                        </p>
                        <p className="text-[13px] text-gray-800 line-clamp-1">
                          {h.text}
                        </p>
                      </div>
                    ))}
                    {weeklyAnswers.length > 2 && (
                      <p className="text-[11px] text-gray-400">
                        他{weeklyAnswers.length - 2}件は詳細で
                      </p>
                    )}
                  </div>
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
                  colors={resolveRole(roleDefs, selected.role).colors}
                  size="lg"
                />
                <div className="min-w-0">
                  {selected.kana && (
                    <p className="text-xs text-gray-400">{selected.kana}</p>
                  )}
                  <p className="text-lg font-medium text-gray-900">
                    {displayName(selected.name)}
                  </p>
                  {selected.role && (
                    <span
                      className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full ${resolveRole(roleDefs, selected.role).colors.bg} ${resolveRole(roleDefs, selected.role).colors.text}`}
                    >
                      {resolveRole(roleDefs, selected.role).label}
                    </span>
                  )}
                  {/* メールは本人が希望した場合のみ・詳細でだけ表示（指示書44） */}
                  {selected.showEmail === true && selected.email && (
                    <p className="mt-1 text-xs text-gray-400">
                      ✉{" "}
                      <a
                        href={`mailto:${selected.email}`}
                        className="hover:underline underline-offset-2"
                      >
                        {selected.email}
                      </a>
                    </p>
                  )}
                </div>
              </div>

              {selected.message && (
                <p
                  className={`text-sm text-gray-500 border-l-2 ${resolveRole(roleDefs, selected.role).colors.border} rounded-none pl-3`}
                >
                  {selected.message}
                </p>
              )}

              {/* あなたとの共通点（何が一致したか。ログイン中＋一致ありのみ）46R-C */}
              {(() => {
                const common = commonPointsWith(selected.userId);
                if (common.length === 0) return null;
                return (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <h3 className="text-[13px] text-amber-700 font-medium mb-1.5">
                      🤝 あなたとの共通点
                    </h3>
                    <ul className="space-y-1">
                      {common.map((cp) => (
                        <li key={cp.key} className="text-[13px] text-gray-800">
                          <span className="text-gray-500">{cp.label}:</span>{" "}
                          {cp.values.join("、")}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

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

              {/* カスタム項目（値が入っているものだけ表示。🔒=privateは出さない・指示書52） */}
              {fieldDefs
                .filter(
                  (f) =>
                    !isFieldPrivate(selected, f.id) &&
                    (selected.customFields?.[f.id] ?? "").trim()
                )
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

              {/* 🧭 5つの基本的欲求（公開している人のみ・指示書58） */}
              {selected.needsSurvey?.visibility === "public" &&
                hasSurveyContent(selected.needsSurvey) && (
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <h3 className="text-[13px] text-gray-400">
                      🧭 5つの基本的欲求
                    </h3>
                    <div className="flex flex-wrap items-start gap-3">
                      {Object.keys(radarValuesOf(selected.needsSurvey))
                        .length > 0 && (
                        <div className="flex-1 min-w-[220px] flex justify-center">
                          <NeedsRadarChart
                            values={radarValuesOf(selected.needsSurvey)}
                            size={220}
                          />
                        </div>
                      )}
                      {selected.needsSurvey.imageUrl &&
                        (isPdfAsset(selected.needsSurvey.imageUrl) ? (
                          // PDFは拡大モーダルを出さず別タブリンク（指示書60）
                          <a
                            href={selected.needsSurvey.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex flex-col items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-teal-700 hover:bg-teal-50"
                          >
                            <span className="text-2xl">📄</span>
                            サーベイPDFを開く
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomPhoto(selected.needsSurvey!.imageUrl!)
                            }
                            className="shrink-0"
                            title="クリックで拡大"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={selected.needsSurvey.imageUrl}
                              alt="サーベイ結果画像"
                              className="w-28 rounded-md border border-border object-cover hover:opacity-90"
                            />
                          </button>
                        ))}
                    </div>
                    {/* 詳細15項目（値がある場合のみ・折りたたみ） */}
                    {Object.keys(selected.needsSurvey.details ?? {}).length >
                      0 && (
                      <details>
                        <summary className="text-xs text-teal-700 cursor-pointer underline underline-offset-2">
                          詳細15項目を見る
                        </summary>
                        <div className="overflow-x-auto mt-2">
                          {/* 「項目／欲求」の2列のみ（指示書61）。
                              5グループ見出し＋色＋区切り線（指示書62・/profileと同一定義） */}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-100">
                                <th className="text-left py-1 pr-2 font-medium">
                                  項目
                                </th>
                                <th className="text-right py-1 px-2 font-medium">
                                  欲求
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {NEEDS_GROUPS.map((group) => {
                                const items = group.items.filter(
                                  (item) =>
                                    selected.needsSurvey?.details?.[item.key]
                                );
                                if (items.length === 0) return null;
                                const s = NEED_GROUP_STYLE[group.key];
                                return (
                                  <Fragment key={group.key}>
                                    <tr
                                      className={`${s.headerBg} border-t-2 border-gray-200`}
                                    >
                                      <td colSpan={2} className="py-1 px-2">
                                        <span
                                          className={`inline-block h-2 w-2 rounded-full mr-1.5 align-middle ${s.dot}`}
                                        />
                                        <span
                                          className={`font-semibold ${s.text}`}
                                        >
                                          {group.label}
                                        </span>
                                      </td>
                                    </tr>
                                    {items.map((item) => (
                                      <tr
                                        key={item.key}
                                        className={`border-b border-gray-50 border-l-4 ${s.rowBorder}`}
                                      >
                                        <td className="py-1 pl-2 pr-2 text-gray-800 whitespace-nowrap">
                                          {item.label}
                                        </td>
                                        <td className="py-1 px-2 text-right text-gray-700 tabular-nums">
                                          {selected.needsSurvey?.details?.[
                                            item.key
                                          ]?.desire ?? "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                    <p className="text-[10px] text-gray-400">
                      相互理解のための共有です（評価・優劣付けには使いません）
                    </p>
                  </div>
                )}

              {/* これまでの回答（今週の質問。0件なら非表示・最新5件＋もっと見る）指示書47 */}
              {weeklyHistory.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <h3 className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-2">
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                    💬 これまでの回答（今週の質問）
                  </h3>
                  <ul className="space-y-2.5">
                    {(showAllHistory
                      ? weeklyHistory
                      : weeklyHistory.slice(0, 5)
                    ).map((h) => (
                      <li key={`${h.weekKey}_${h.at}`}>
                        <p className="text-xs text-gray-400">
                          {h.question ?? "（当時の質問）"}
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {h.text}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {weekRangeLabel(h.weekKey)}の週
                        </p>
                      </li>
                    ))}
                  </ul>
                  {weeklyHistory.length > 5 && !showAllHistory && (
                    <button
                      type="button"
                      onClick={() => setShowAllHistory(true)}
                      className="mt-2 text-xs text-teal-700 underline underline-offset-2"
                    >
                      もっと見る（あと{weeklyHistory.length - 5}件）
                    </button>
                  )}
                </div>
              )}

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
