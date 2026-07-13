"use client";

// マイプロフィール編集（要ログイン。未ログインは /login へ）
// テキスト保存: PUT /api/profile ／ 写真: POST・DELETE /api/profile/photos
// 編集できるのは自分のプロフィールのみ（サーバー側でセッション検証）。

import { useCallback, useEffect, useRef, useState } from "react";
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

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

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
    async (kind: "avatar" | "photo", file: File) => {
      const blob = await resizeImageToJpeg(
        file,
        kind === "avatar" ? AVATAR_MAX_EDGE : PHOTO_MAX_EDGE
      );
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", blob, "image.jpg");
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
            <Label htmlFor="p-role">役職</Label>
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
          {fieldDefs.map((f) => (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={`cf-${f.id}`}>{f.label}</Label>
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
          ))}
          <p className="text-xs text-muted-foreground">
            入力内容は「💾 保存」ボタンで保存されます。
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
