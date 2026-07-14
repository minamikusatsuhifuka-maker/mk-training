"use client";

// マイプロフィール編集（要ログイン。未ログインは /login へ）
// テキスト保存: PUT /api/profile ／ 写真: POST・DELETE /api/profile/photos
// 編集できるのは自分のプロフィールのみ（サーバー側でセッション検証）。

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  resizeImageToJpeg,
  AVATAR_MAX_EDGE,
  PHOTO_MAX_EDGE,
} from "@/lib/image-resize";
import {
  MAX_SHARED_PHOTOS,
  emptyProfile,
  type StaffProfile,
} from "@/lib/staff-profiles";
import {
  DEFAULT_PROFILE_ROLES,
  loadProfileRoleConfig,
  resolveRole,
  visibleProfileRoles,
  type ProfileRoleDef,
} from "@/lib/profile-roles";
import {
  loadProfileFieldConfig,
  visibleProfileFields,
  type ProfileFieldDef,
} from "@/lib/profile-fields";
import { loadPortalItems } from "@/lib/portal-store";
import { loadPortalFeatures } from "@/lib/portal-features";
import {
  PORTAL_KEYS,
  thankyouToNames,
  normalizeThankyouName as normalizeName,
  type ThankyouItem,
} from "@/types/portal";
import {
  NEED_KEYS,
  NEED_LABELS,
  NEEDS_GROUPS,
  NEED_GROUP_STYLE,
  clampNeedValue,
  isPdfAsset,
  type NeedKey,
  type NeedDetailValues,
} from "@/lib/needs-survey";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [email, setEmail] = useState("");
  const [fieldDefs, setFieldDefs] = useState<ProfileFieldDef[]>([]);
  // 役職の選択肢（管理画面で編集可・指示書51）。読み込み失敗時は既定6役職
  const [roleDefs, setRoleDefs] = useState<ProfileRoleDef[]>(
    DEFAULT_PROFILE_ROLES
  );
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // パスワード変更（仮パスワードでログインした人が自分で変更できるように）
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // 📮 今月あなたに届いたありがとう（46R-B。thanksShowcase OFF・0件なら非表示）
  const [myThanks, setMyThanks] = useState<ThankyouItem[]>([]);

  // 🧭 5つの基本的欲求サーベイ（指示書58。保存は「💾 保存」に含める）
  const [surveyValues, setSurveyValues] = useState<
    Partial<Record<NeedKey, number>>
  >({});
  const [surveyDetails, setSurveyDetails] = useState<
    Record<string, NeedDetailValues>
  >({});
  const [surveyVisibility, setSurveyVisibility] = useState<
    "private" | "public"
  >("private");
  // AI読み取り由来で確定済みか（指示書61。trueの間はスライダー非表示・修正は削除→再読み取り）
  const [surveyAiParsed, setSurveyAiParsed] = useState(false);
  const [surveyParsing, setSurveyParsing] = useState(false);
  const [showSurveyDetails, setShowSurveyDetails] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const surveyInputRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 3000);
  };
  const fail = (msg: string) => {
    setError(msg);
    setMessage("");
  };

  // ログイン確認 → プロフィール取得
  useEffect(() => {
    const init = async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/profile");
        return;
      }
      // カスタム項目の定義を読み込む（失敗しても既定セットにフォールバック）
      loadProfileFieldConfig()
        .then((defs) => setFieldDefs(visibleProfileFields(defs)))
        .catch(() => {});
      // 役職の選択肢（指示書51。失敗しても既定6役職）
      loadProfileRoleConfig()
        .then(setRoleDefs)
        .catch(() => {});
      const res = await fetch("/api/profile");
      if (res.status === 401) {
        router.replace("/login?next=/profile");
        return;
      }
      if (!res.ok) {
        setProfile(emptyProfile(user.id));
        fail("プロフィールの読み込みに失敗しました");
        return;
      }
      const json = (await res.json()) as {
        profile: StaffProfile;
        email: string;
      };
      setProfile(json.profile);
      setEmail(json.email);
      setCaptions(
        Object.fromEntries(
          json.profile.photos.map((p) => [p.url, p.caption ?? ""])
        )
      );
      // サーベイの編集stateを初期化（指示書58）
      setSurveyValues(json.profile.needsSurvey?.values ?? {});
      setSurveyDetails(json.profile.needsSurvey?.details ?? {});
      setSurveyVisibility(json.profile.needsSurvey?.visibility ?? "private");
      setSurveyAiParsed(json.profile.needsSurvey?.aiParsed === true);
      // 今月自分宛のありがとうカード（宛先名とプロフィール名の一致で紐付け。46R-B）
      loadPortalFeatures()
        .then(async (f) => {
          if (!f.thanksShowcase) return;
          const me = normalizeName(json.profile.name);
          if (!me) return;
          const all = await loadPortalItems<ThankyouItem>(
            PORTAL_KEYS.thankyou,
            []
          );
          const now = new Date();
          setMyThanks(
            all
              .filter((t) => {
                const d = new Date(t.createdAt);
                // 宛先が複数（配列）の場合は自分の名前が含まれていれば「自分宛」
                return (
                  thankyouToNames(t).some(
                    (name) => normalizeName(name) === me
                  ) &&
                  d.getFullYear() === now.getFullYear() &&
                  d.getMonth() === now.getMonth()
                );
              })
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          );
        })
        .catch(() => {});
    };
    init().catch(() => fail("読み込みに失敗しました"));
  }, [router]);

  const set = <K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));

  const handleSave = async () => {
    if (!profile) return;
    if (!profile.name.trim()) {
      fail("名前は必須です");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: profile.userId,
        name: profile.name,
        kana: profile.kana,
        role: profile.role,
        bio: profile.bio,
        hobbies: profile.hobbies,
        message: profile.message,
        photoCaptions: captions,
        customFields: profile.customFields,
        customFieldsPrivacy: profile.customFieldsPrivacy ?? {},
        needsSurvey: {
          values: surveyValues,
          details: surveyDetails,
          visibility: surveyVisibility,
          aiParsed: surveyAiParsed,
        },
        showEmail: profile.showEmail === true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      fail(j?.error ?? "保存に失敗しました");
      return;
    }
    flash("💾 プロフィールを保存しました");
  };

  // ─── パスワード変更 ───
  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      fail("新しいパスワードは8文字以上にしてください");
      return;
    }
    if (newPassword !== newPassword2) {
      fail("確認用のパスワードが一致しません");
      return;
    }
    setChangingPassword(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    const { error: pwError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setChangingPassword(false);
    if (pwError) {
      fail(
        /same|different/i.test(pwError.message)
          ? "現在と同じパスワードには変更できません"
          : `パスワードの変更に失敗しました: ${pwError.message}`
      );
      return;
    }
    setNewPassword("");
    setNewPassword2("");
    flash("🔒 パスワードを変更しました。次回から新しいパスワードでログインしてください");
  };

  // ─── 写真アップロード ───
  const upload = useCallback(
    async (kind: "avatar" | "photo" | "survey", file: File) => {
      // PDF（サーベイのみ）はリサイズせずそのまま送る（指示書60）
      const isPdf = kind === "survey" && file.type === "application/pdf";
      const blob = isPdf
        ? file
        : await resizeImageToJpeg(
            file,
            kind === "avatar" ? AVATAR_MAX_EDGE : PHOTO_MAX_EDGE
          );
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", blob, isPdf ? "survey.pdf" : "image.jpg");
      const res = await fetch("/api/profile/photos", {
        method: "POST",
        body: form,
      });
      const j = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !j?.url) {
        throw new Error(j?.error ?? "アップロードに失敗しました");
      }
      return j.url;
    },
    []
  );

  const handleAvatarFiles = async (files: FileList | File[]) => {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setUploading(true);
    try {
      const url = await upload("avatar", file);
      set("avatarUrl", url);
      flash("📷 アバターを更新しました");
    } catch (e) {
      fail(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoFiles = async (files: FileList | File[]) => {
    if (!profile) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading(true);
    try {
      for (const file of images) {
        const url = await upload("photo", file);
        const uploadedAt = new Date().toISOString();
        setProfile((p) =>
          p ? { ...p, photos: [...p.photos, { url, uploadedAt }] } : p
        );
        setCaptions((c) => ({ ...c, [url]: "" }));
      }
      flash("📷 写真を追加しました");
    } catch (e) {
      fail(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  // ─── 🧭 サーベイ画像・AI抽出（指示書58。PDF対応は60） ───
  const handleSurveyFiles = async (files: FileList | File[]) => {
    const file = Array.from(files).find(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (!file) return;
    setUploading(true);
    try {
      const url = await upload("survey", file);
      setProfile((p) =>
        p
          ? {
              ...p,
              needsSurvey: {
                visibility: surveyVisibility,
                ...(p.needsSurvey ?? {}),
                imageUrl: url,
                updatedAt: new Date().toISOString(),
              },
            }
          : p
      );
      flash("🧭 サーベイファイルをアップロードしました");
    } catch (e) {
      fail(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  // 削除＝ファイル＋読み取り値をクリアするリセット導線（指示書61）。
  // aiParsed=false に戻り、スライダーが再表示され手入力できる（開示設定は維持）。
  const handleDeleteSurveyImage = async () => {
    const url = profile?.needsSurvey?.imageUrl;
    if (!url) return;
    if (
      !confirm(
        "サーベイのファイルと読み取り値を削除しますか？\n（削除後は手入力、または再アップロード→再読み取りができます）"
      )
    )
      return;
    const res = await fetch("/api/profile/photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      fail(j?.error ?? "削除に失敗しました");
      return;
    }
    setProfile((p) =>
      p && p.needsSurvey
        ? {
            ...p,
            needsSurvey: {
              visibility: p.needsSurvey.visibility,
              aiParsed: false,
              updatedAt: new Date().toISOString(),
            },
          }
        : p
    );
    setSurveyValues({});
    setSurveyDetails({});
    setSurveyAiParsed(false);
    flash("🗑️ サーベイを削除しました（手入力・再アップロードができます）");
  };

  // アップロード済みファイルURL→base64（AI抽出用。Storageはpublic・CORS許可あり。
  // PDFもそのままbase64化してGeminiのinlineDataで渡す・指示書60）
  const surveyImageToBase64 = async (
    url: string
  ): Promise<{ base64: string; mediaType: string }> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("ファイルの取得に失敗しました");
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      r.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(",")[1] ?? "";
    const mediaType =
      blob.type || (isPdfAsset(url) ? "application/pdf" : "image/jpeg");
    return { base64, mediaType };
  };

  // AIで数値を読み取る（下書き→レビュー表に反映。保存は本人が「💾 保存」で確定）
  const handleSurveyParse = async () => {
    const url = profile?.needsSurvey?.imageUrl;
    if (!url) {
      fail("先にサーベイ結果（画像またはPDF）をアップロードしてください");
      return;
    }
    setSurveyParsing(true);
    setError("");
    try {
      const { base64, mediaType } = await surveyImageToBase64(url);
      const res = await fetch("/api/profile/survey-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType }),
      });
      const j = (await res.json().catch(() => null)) as {
        values?: Partial<Record<NeedKey, number>>;
        details?: Record<string, NeedDetailValues>;
        error?: string;
      } | null;
      if (!res.ok) {
        fail(
          j?.error
            ? `AI読み取りに失敗しました: ${j.error}`
            : "AI読み取りに失敗しました。手入力してください"
        );
        return;
      }
      const values = j?.values ?? {};
      const details = j?.details ?? {};
      if (
        Object.keys(values).length === 0 &&
        Object.keys(details).length === 0
      ) {
        fail("数値を読み取れませんでした。手入力してください");
        return;
      }
      setSurveyValues(values);
      setSurveyDetails(details);
      // AI読み取り由来として確定（指示書61）。スライダーは非表示になり、
      // 修正したい場合は削除→再アップロード／再読み取りで対応する
      setSurveyAiParsed(true);
      if (Object.keys(details).length > 0) setShowSurveyDetails(true);
      flash(
        "🤖 AIが読み取りました。レーダーチャートを確認して「💾 保存」で確定してください"
      );
    } catch (e) {
      fail(e instanceof Error ? e.message : "AI読み取りに失敗しました");
    } finally {
      setSurveyParsing(false);
    }
  };

  const setSurveyValue = (k: NeedKey, raw: string) => {
    const v = clampNeedValue(raw);
    setSurveyValues((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });
  };

  const setSurveyDetail = (
    itemKey: string,
    field: keyof NeedDetailValues,
    raw: string
  ) => {
    const v = clampNeedValue(raw);
    setSurveyDetails((prev) => {
      const row = { ...(prev[itemKey] ?? {}) };
      if (v === undefined) delete row[field];
      else row[field] = v;
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[itemKey];
      else next[itemKey] = row;
      return next;
    });
  };

  const handleDeletePhoto = async (url: string) => {
    if (!confirm("この写真を削除しますか？")) return;
    const res = await fetch("/api/profile/photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      fail(j?.error ?? "削除に失敗しました");
      return;
    }
    setProfile((p) =>
      p ? { ...p, photos: p.photos.filter((x) => x.url !== url) } : p
    );
    setCaptions((c) => {
      const next = { ...c };
      delete next[url];
      return next;
    });
    flash("🗑️ 写真を削除しました");
  };

  if (!profile) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
        <PageHeader title="👤 マイプロフィール" description="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="👤 マイプロフィール"
        description="メンバー紹介ページに表示される自分のプロフィールを編集します"
      />

      {(message || error) && (
        <p
          className={`text-sm rounded-md px-3 py-2 ${
            error
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {error || message}
        </p>
      )}

      {/* 📮 今月あなたに届いたありがとう（0件なら非表示）46R-B */}
      {myThanks.length > 0 && (
        <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-pink-800">
            📮 今月あなたに届いたありがとう（{myThanks.length}件）
          </h2>
          <div className="space-y-2">
            {myThanks.map((t) => (
              <div
                key={t.id}
                className="p-3 bg-white border border-pink-100 rounded-xl"
              >
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {t.message}
                </p>
                <p className="text-xs text-gray-500 mt-1.5">
                  {t.fromName} より ·{" "}
                  {new Date(t.createdAt).toLocaleDateString("ja-JP")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* アバター */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">アバター写真</h2>
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt="アバター"
              className="h-20 w-20 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-accent flex items-center justify-center text-2xl">
              👤
            </div>
          )}
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploading ? "アップロード中..." : "画像を選ぶ"}
            </Button>
            <p className="text-xs text-muted-foreground">
              自動で長辺512pxに縮小されます（JPEG）
            </p>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleAvatarFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* 基本情報 */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">基本情報</h2>
        <p className="text-xs text-muted-foreground">
          ログイン中: {email}（プロフィールは本人のみ編集できます）
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-name">名前 *</Label>
            <Input
              id="p-name"
              value={profile.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例：山田 花子"
            />
            {profile.name.includes("@") && (
              <p className="text-xs text-amber-700">
                ⚠️
                表示名がメールアドレスになっています。お名前（例: 楠葉
                展大）を設定しましょう。
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-kana">ふりがな</Label>
            <Input
              id="p-kana"
              value={profile.kana}
              onChange={(e) => set("kana", e.target.value)}
              placeholder="例：やまだ はなこ"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-role">役割（職種）</Label>
            <select
              id="p-role"
              value={profile.role}
              onChange={(e) => set("role", e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">未設定</option>
              {visibleProfileRoles(roleDefs).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
              {/* 現在の役職が非表示化・削除済みの場合も値が消えないよう選択肢として残す */}
              {profile.role &&
                !visibleProfileRoles(roleDefs).some(
                  (r) => r.id === profile.role
                ) && (
                  <option value={profile.role}>
                    {resolveRole(roleDefs, profile.role).label}
                  </option>
                )}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-message">ひとこと</Label>
            <Input
              id="p-message"
              value={profile.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="例：よろしくお願いします！"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-bio">自己紹介</Label>
          <Textarea
            id="p-bio"
            rows={4}
            value={profile.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="経歴や得意分野、メンバーに知ってほしいことなど"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-hobbies">趣味・特技</Label>
          <Textarea
            id="p-hobbies"
            rows={3}
            value={profile.hobbies}
            onChange={(e) => set("hobbies", e.target.value)}
            placeholder="例：カフェ巡り、写真、韓国ドラマ"
          />
        </div>

        {/* メールアドレスの表示希望（既定OFF・詳細ダイアログのみに表示される） */}
        <div className="space-y-1 pt-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.showEmail === true}
              onChange={(e) => set("showEmail", e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span>
              ✉ メールアドレスをメンバー紹介に表示する
              <span className="block text-xs text-muted-foreground mt-0.5">
                ONにすると、メンバー紹介であなたの詳細を開いた人にメールアドレスが表示されます（一覧カードには表示されません）。
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* もっと自己紹介（カスタム項目・すべて任意） */}
      {fieldDefs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            ✨ もっと自己紹介
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              書きたい項目だけでOK
            </span>
          </h2>
          {fieldDefs.map((f) => {
            const value = profile.customFields[f.id] ?? "";
            const isPrivate =
              profile.customFieldsPrivacy?.[f.id] === "private";
            const togglePrivacy = () =>
              set("customFieldsPrivacy", {
                ...(profile.customFieldsPrivacy ?? {}),
                [f.id]: isPrivate ? "public" : "private",
              });
            return (
            <div key={f.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`cf-${f.id}`}>{f.label}</Label>
                {/* 開示トグル（指示書52。既定=公開。空値はグレーアウトで操作不要） */}
                <button
                  type="button"
                  onClick={togglePrivacy}
                  disabled={!value.trim()}
                  title={
                    isPrivate
                      ? "自分にだけ見えます（クリックで公開に）"
                      : "メンバー紹介に表示されます（クリックで自分のみに）"
                  }
                  className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                    !value.trim()
                      ? "border-gray-200 text-gray-300 cursor-default"
                      : isPrivate
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-teal-200 bg-teal-50 text-teal-700"
                  }`}
                >
                  {isPrivate ? "🔒 自分のみ" : "🌐 公開"}
                </button>
              </div>
              {f.type === "textarea" ? (
                <Textarea
                  id={`cf-${f.id}`}
                  rows={3}
                  value={profile.customFields[f.id] ?? ""}
                  onChange={(e) =>
                    set("customFields", {
                      ...profile.customFields,
                      [f.id]: e.target.value,
                    })
                  }
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  id={`cf-${f.id}`}
                  value={profile.customFields[f.id] ?? ""}
                  onChange={(e) =>
                    set("customFields", {
                      ...profile.customFields,
                      [f.id]: e.target.value,
                    })
                  }
                  placeholder={f.placeholder}
                />
              )}
            </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            入力内容は「💾 保存」ボタンで保存されます。🔒にした項目は自分にだけ見え、メンバー紹介には表示されません。
          </p>
        </div>
      )}

      {/* 共有写真 */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">
          共有写真{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {profile.photos.length} / {MAX_SHARED_PHOTOS} 枚
          </span>
        </h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handlePhotoFiles(e.dataTransfer.files);
          }}
          onClick={() => photosInputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-6 text-center text-sm cursor-pointer transition-colors ${
            dragOver
              ? "border-teal bg-teal-light/40"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {uploading
            ? "アップロード中..."
            : "ここに画像をドラッグ&ドロップ、またはクリックして選択（複数可・長辺1600pxに自動縮小）"}
          <input
            ref={photosInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handlePhotoFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {profile.photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {profile.photos.map((p) => (
              <div
                key={p.url}
                className="rounded-lg border border-border overflow-hidden bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption || "共有写真"}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-2 space-y-1.5">
                  <Input
                    value={captions[p.url] ?? ""}
                    onChange={(e) =>
                      setCaptions((c) => ({ ...c, [p.url]: e.target.value }))
                    }
                    placeholder="キャプション（任意）"
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(p.url)}
                    className="text-xs text-foreground/60 hover:text-red-600"
                  >
                    🗑️ 削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          キャプションは「保存」ボタンで反映されます。
        </p>
      </div>

      {/* 🧭 5つの基本的欲求サーベイ（指示書58） */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            🧭 5つの基本的欲求サーベイ
          </h2>
          {/* 開示トグル（既定🔒） */}
          <button
            type="button"
            onClick={() =>
              setSurveyVisibility((v) =>
                v === "public" ? "private" : "public"
              )
            }
            className={`text-xs px-2.5 py-1 rounded-full border ${
              surveyVisibility === "public"
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {surveyVisibility === "public"
              ? "🌐 メンバー紹介に公開"
              : "🔒 自分のみ"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          選択理論の「5つの基本的欲求」サーベイ結果を共有できます。公開すると、あなたのレーダーチャートと画像が他の人に見えます（既定は🔒自分のみ）。数値は相互理解のためのもので、評価や優劣付けには使いません。
        </p>

        {/* 画像アップロード＋プレビュー */}
        <div className="flex flex-wrap gap-4 items-start">
          <div className="space-y-2 w-full sm:w-56">
            {profile.needsSurvey?.imageUrl ? (
              <div className="space-y-1.5">
                {isPdfAsset(profile.needsSurvey.imageUrl) ? (
                  // PDFは<img>にしない（指示書60）: 📄＋ファイル名＋別タブリンク
                  <div className="rounded-lg border border-border bg-white p-4 text-center space-y-1.5">
                    <p className="text-3xl">📄</p>
                    <p className="text-xs text-foreground/70 break-all">
                      {decodeURIComponent(
                        profile.needsSurvey.imageUrl
                          .split("?")[0]
                          .split("/")
                          .pop() ?? "survey.pdf"
                      )}
                    </p>
                    <a
                      href={profile.needsSurvey.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs text-teal-700 underline underline-offset-2"
                    >
                      別タブで開く
                    </a>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.needsSurvey.imageUrl}
                    alt="サーベイ結果画像"
                    className="w-full rounded-lg border border-border object-contain max-h-64 bg-white"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => surveyInputRef.current?.click()}
                    className="text-xs text-foreground/60 hover:text-foreground underline underline-offset-2"
                  >
                    差し替え
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSurveyImage}
                    className="text-xs text-foreground/60 hover:text-red-600 underline underline-offset-2"
                  >
                    🗑️ 削除
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleSurveyFiles(e.dataTransfer.files);
                }}
                onClick={() => surveyInputRef.current?.click()}
                className={`rounded-lg border-2 border-dashed p-6 text-center text-xs cursor-pointer transition-colors ${
                  dragOver
                    ? "border-teal bg-teal-light/40"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {uploading
                  ? "アップロード中..."
                  : "サーベイ結果（画像またはPDF）をドラッグ&ドロップ、またはクリックして選択"}
              </div>
            )}
            <input
              ref={surveyInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleSurveyFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSurveyParse}
              disabled={surveyParsing || uploading || !profile.needsSurvey?.imageUrl}
              className="w-full"
            >
              {surveyParsing ? "読み取り中..." : "🤖 AIで数値を読み取る"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              AIの読み取りは目安（下書き）です。必ず数値を確認・修正してから保存してください。
            </p>
          </div>

          {/* レーダーチャート即時プレビュー */}
          <div className="flex-1 min-w-[240px] flex justify-center">
            <NeedsRadarChart values={surveyValues} size={240} />
          </div>
        </div>

        {/* 5欲求の入力（スライダー＋数値）。AI読み取り後は非表示＝値はレーダーの
            ラベルで確認する（指示書61。修正は削除→再アップロード／再読み取り） */}
        {surveyAiParsed ? (
          <p className="text-[11px] text-muted-foreground">
            5欲求のスコアはAI読み取り結果で確定しています（レーダーチャートのラベルで確認できます）。数値を修正したい場合は🗑削除して再アップロード／再読み取りしてください。
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {NEED_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-xs text-foreground/70 w-16 shrink-0">
                  {NEED_LABELS[k]}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={surveyValues[k] ?? 0}
                  onChange={(e) => setSurveyValue(k, e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={surveyValues[k] ?? ""}
                  onChange={(e) => setSurveyValue(k, e.target.value)}
                  className="h-8 w-20 text-sm"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        )}

        {/* 詳細15項目（折りたたみ表） */}
        <div>
          <button
            type="button"
            onClick={() => setShowSurveyDetails((s) => !s)}
            className="text-xs text-teal-700 underline underline-offset-2"
          >
            {showSurveyDetails
              ? "▼ 詳細15項目を閉じる"
              : "▶ 詳細15項目（欲求）を見る・入力する"}
          </button>
          {showSurveyDetails && (
            <div className="overflow-x-auto mt-2">
              {/* 表示は「項目／欲求」の2列のみ（指示書61）。
                  5グループごとに見出し行＋色＋区切り線でまとめる（指示書62） */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-1.5 pr-2 font-medium">項目</th>
                    <th className="text-center py-1.5 px-1 font-medium">
                      欲求
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {NEEDS_GROUPS.map((group) => {
                    const s = NEED_GROUP_STYLE[group.key];
                    return (
                      <Fragment key={group.key}>
                        {/* グループ見出し行（境界は濃いめの上ボーダーで区切る） */}
                        <tr className={`${s.headerBg} border-t-2 border-border`}>
                          <td colSpan={2} className="py-1.5 px-2">
                            <span
                              className={`inline-block h-2 w-2 rounded-full mr-1.5 align-middle ${s.dot}`}
                            />
                            <span className={`font-semibold ${s.text}`}>
                              {group.label}
                            </span>
                          </td>
                        </tr>
                        {group.items.map((item) => (
                          <tr
                            key={item.key}
                            className={`border-b border-border/50 border-l-4 ${s.rowBorder}`}
                          >
                            <td className="py-1 pl-2 pr-2 whitespace-nowrap">
                              {item.label}
                            </td>
                            <td className="py-1 px-1 text-center">
                              {surveyAiParsed ? (
                                // AI読み取り後は表示専用（指示書61）
                                <span className="tabular-nums">
                                  {surveyDetails[item.key]?.desire ?? "—"}
                                </span>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={surveyDetails[item.key]?.desire ?? ""}
                                  onChange={(e) =>
                                    setSurveyDetail(
                                      item.key,
                                      "desire",
                                      e.target.value
                                    )
                                  }
                                  className="h-7 w-16 text-xs mx-auto"
                                  placeholder="—"
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          数値・開示設定は「💾 保存」ボタンで確定します。
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || uploading}>
          {saving ? "保存中..." : "💾 保存"}
        </Button>
      </div>

      {/* パスワード変更 */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">🔒 パスワード変更</h2>
        <p className="text-xs text-muted-foreground">
          仮パスワードでログインした方は、ここで自分のパスワードに変更してください（8文字以上）。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-new-password">新しいパスワード</Label>
            <Input
              id="p-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8文字以上"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-new-password2">新しいパスワード（確認）</Label>
            <Input
              id="p-new-password2"
              type="password"
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              placeholder="もう一度入力"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !newPassword2}
          >
            {changingPassword ? "変更中..." : "パスワードを変更"}
          </Button>
        </div>
      </div>
    </div>
  );
}
