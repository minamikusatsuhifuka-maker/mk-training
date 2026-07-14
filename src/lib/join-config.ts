// QR/URLからのスタッフ自己登録の設定（指示書55）
// content_store `join_config` に { enabled, code, updatedAt } を保存。
// 読み書きはサーバーAPI（/api/join・/api/admin/join-config）経由のみ。
// クライアントにコードを渡すのは管理画面（requireAdmin通過後）だけにする。

export const JOIN_CONFIG_KEY = "join_config";

export type JoinConfig = {
  enabled: boolean;
  code: string;
  updatedAt: string;
};

export function normalizeJoinConfig(raw: unknown): JoinConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.code !== "string" || !o.code.trim()) return null;
  return {
    enabled: o.enabled === true,
    code: o.code.trim(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

// 招待コード生成: 英大文字+数字の8文字。紛らわしい文字（I/L/O/0/1）は除外
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
  let code = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(8);
    crypto.getRandomValues(buf);
    for (const v of buf) code += CODE_CHARS[v % CODE_CHARS.length];
  } else {
    for (let i = 0; i < 8; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  }
  return code;
}

// 入力コードの照合用正規化（前後空白除去・大文字化。小文字入力でも通す）
export function normalizeJoinCodeInput(s: string): string {
  return s.trim().toUpperCase();
}
