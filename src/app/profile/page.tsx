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
  PROFILE_ROLES,
  MAX_SHARED_PHOTOS,
  emptyProfile,
  type StaffProfile,
} from "@/lib/staff-profiles";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [email, setEmail] = useState("");
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

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
              {PROFILE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
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
      </div>

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
    </div>
  );
}
