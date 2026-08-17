#!/usr/bin/env node
// スタッフURL（mk-training.vercel.app）が最新の本番デプロイを指しているかの検証（指示書168）
//
// 【背景】2026-08-16 の `vercel rollback` がプロジェクトの autoAssignCustomDomains を
// false にしたまま残り、push しても スタッフURL が旧デプロイを指し続ける事故が起きた
// （約1日、セキュリティ修正がスタッフに届かなかった）。
// 「デプロイ完了」と「スタッフURLが最新を指していること」は別物。毎便これで検証する。
//
// 使い方: npm run check-alias
// 判定:  ✅ 一致 → exit 0 ／ ❌ ずれ・エラー → exit 1（張り直しコマンドを表示）
//
// 認証: Vercel CLI のログイン情報（auth.json）または環境変数 VERCEL_TOKEN を使う。

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STAFF_URL = "mk-training.vercel.app";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function getToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const candidates = [
    join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"), // macOS
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"), // Linux
    join(homedir(), ".vercel", "auth.json"), // 旧CLI
  ];
  for (const p of candidates) {
    try {
      const t = readJson(p).token;
      if (t) return t;
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error(
    "Vercelの認証情報が見つかりません（`vercel login` するか VERCEL_TOKEN を設定してください）"
  );
}

async function api(path, token) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${json?.error?.message ?? "unknown"}`);
  }
  return json;
}

try {
  const { projectId, orgId } = readJson(join(root, ".vercel", "project.json"));
  const token = getToken();
  const team = `teamId=${orgId}`;

  // 最新の本番デプロイ（READY のみ）
  const dep = await api(
    `/v6/deployments?projectId=${projectId}&target=production&state=READY&limit=1&${team}`,
    token
  );
  const latest = dep.deployments?.[0];
  if (!latest) throw new Error("READY な本番デプロイが見つかりません");

  // スタッフURLの現在の向き先
  const alias = await api(`/v4/aliases/${STAFF_URL}?${team}`, token);

  // 再発の芽の監視: rollback がこのフラグを false に落とすと自動追従が止まる
  const project = await api(`/v9/projects/${projectId}?${team}`, token);
  const autoAssign = project.autoAssignCustomDomains;

  const latestId = latest.uid ?? latest.id;
  const ok = alias.deploymentId === latestId;

  console.log(`最新本番デプロイ: ${latest.url}（${latestId}）`);
  console.log(`${STAFF_URL} の向き先: ${alias.deployment?.url ?? alias.deploymentId}`);
  console.log(`autoAssignCustomDomains: ${autoAssign}`);

  if (autoAssign === false) {
    console.error(
      "⚠️ autoAssignCustomDomains が false です（rollback の残留）。このままだと今後の push が自動追従しません。"
    );
  }

  if (ok && autoAssign !== false) {
    console.log(`✅ ${STAFF_URL} は最新デプロイを指しています`);
    process.exit(0);
  }
  if (!ok) {
    console.error(`❌ ${STAFF_URL} が最新デプロイを指していません。張り直し:`);
    console.error(
      `   npx vercel alias set https://${latest.url} ${STAFF_URL} --cwd ${root}`
    );
  }
  process.exit(1);
} catch (e) {
  console.error(`❌ check-alias 失敗: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
