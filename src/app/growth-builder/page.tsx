"use client";

import { useState, useRef, useEffect } from "react";
import { usePageTitle } from "@/lib/use-nav";
import { savePortalItems, loadPortalItems } from "@/lib/portal-store";

type Role = "multi-office" | "nurse" | "all" | "custom";
type Mode = "select" | "dialog" | "template" | "generating" | "result";
type OutputType = "purpose" | "todo" | "beginner" | "expert" | "manual" | "mindset";

type Message = {
  id: string;
  role: "ai" | "user";
  content: string;
};

type GeneratedOutput = {
  purpose: string;
  todo: string;
  beginner: string;
  expert: string;
  manual: string;
  mindset: string;
};

type SavedRoadmap = {
  id: string;
  role: Role;
  roleName: string;
  output: GeneratedOutput;
  createdAt: string;
  mode: "dialog" | "template";
};

const roles: {
  id: Role;
  icon: string;
  name: string;
  sub: string;
  color: "teal" | "pink" | "green" | "amber";
}[] = [
  {
    id: "multi-office",
    icon: "🏥",
    name: "マルチタスク医療事務",
    sub: "医療事務・クラーク・カウンセラーの3役",
    color: "teal",
  },
  {
    id: "nurse",
    icon: "👩‍⚕️",
    name: "看護師",
    sub: "処置・患者管理・生物学的製剤投与",
    color: "pink",
  },
  {
    id: "all",
    icon: "🌱",
    name: "全スタッフ共通",
    sub: "理念・凡事徹底・自己成長",
    color: "green",
  },
  {
    id: "custom",
    icon: "✏️",
    name: "カスタム",
    sub: "役職名・業務を自由入力",
    color: "amber",
  },
];

const ROLE_BORDER: Record<string, string> = {
  teal: "bg-teal-50 border-teal-200 hover:bg-teal-100",
  pink: "bg-pink-50 border-pink-200 hover:bg-pink-100",
  green: "bg-green-50 border-green-200 hover:bg-green-100",
  amber: "bg-amber-50 border-amber-200 hover:bg-amber-100",
};

const ROLE_BORDER_ACTIVE: Record<string, string> = {
  teal: "ring-2 ring-teal-400 bg-teal-100",
  pink: "ring-2 ring-pink-400 bg-pink-100",
  green: "ring-2 ring-green-400 bg-green-100",
  amber: "ring-2 ring-amber-400 bg-amber-100",
};

const outputTabs: { id: OutputType; label: string; icon: string }[] = [
  { id: "purpose", label: "何のために", icon: "🎯" },
  { id: "todo", label: "ToDo", icon: "✅" },
  { id: "beginner", label: "初心者脱却", icon: "📚" },
  { id: "expert", label: "エキスパート", icon: "⭐" },
  { id: "manual", label: "マニュアル", icon: "📖" },
  { id: "mindset", label: "マインド", icon: "💡" },
];

function getRoleName(role: Role | null, customRole: string): string {
  if (!role) return "";
  if (role === "custom") return customRole.trim() || "カスタムロール";
  return roles.find((r) => r.id === role)?.name ?? role;
}

function getInitialMessage(role: Role, customRoleName: string): string {
  const roleName = getRoleName(role, customRoleName);
  return `こんにちは！「${roleName}」の成長ロードマップを一緒に作りましょう。

いくつか質問させてください。まず最初に——

**今、あなた（またはこのロールのスタッフ）はどんな状況ですか？**

例えば：
・入職したばかりで基礎から学びたい
・3ヶ月経ったが自信がなく初心者を脱却したい
・ある程度できるが次のレベルに行きたい
・新人スタッフへの教育資料として使いたい

自由にお話しください 😊`;
}

export default function GrowthBuilderPage() {
  const builderTitle = usePageTitle("/growth-builder", "🚀 成長ロードマップビルダー");
  const viewTitle = usePageTitle("/growth-builder", "✨ 成長ロードマップ");
  const [mode, setMode] = useState<Mode>("select");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [customRole, setCustomRole] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<GeneratedOutput | null>(null);
  const [activeTab, setActiveTab] = useState<OutputType>("purpose");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dialogStep, setDialogStep] = useState(0);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);

  // チャットエリア自動スクロール
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, generating]);

  const isRoleReady =
    selectedRole !== null &&
    (selectedRole !== "custom" || customRole.trim().length > 0);

  const startDialogMode = () => {
    if (!isRoleReady || !selectedRole) return;
    setMode("dialog");
    setMessages([
      {
        id: `msg_${Date.now()}`,
        role: "ai",
        content: getInitialMessage(selectedRole, customRole),
      },
    ]);
    setDialogStep(0);
  };

  const startTemplateMode = async () => {
    if (!isRoleReady || !selectedRole) return;
    setMode("generating");
    setGenerating(true);
    setOutput(null);
    setSaved(false);
    setErrorMsg(null);
    setGenerateProgress(0);

    // プログレス表示の擬似アニメーション
    const progressInterval = setInterval(() => {
      setGenerateProgress((p) => (p < 5 ? p + 1 : p));
    }, 5000);

    try {
      const res = await fetch("/api/growth-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          customRole,
          mode: "template",
        }),
      });
      const data = await res.json();
      clearInterval(progressInterval);
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "生成に失敗しました");
        setMode("select");
        return;
      }
      setGenerateProgress(6);
      setOutput(data as GeneratedOutput);
      setMode("result");
    } catch (e) {
      clearInterval(progressInterval);
      setErrorMsg(e instanceof Error ? e.message : "通信エラー");
      setMode("select");
    } finally {
      setGenerating(false);
    }
  };

  const handleUserMessage = async () => {
    if (!userInput.trim() || generating || !selectedRole) return;
    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: userInput.trim(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setUserInput("");
    setGenerating(true);

    try {
      const res = await fetch("/api/growth-dialog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          role: selectedRole,
          customRole,
          dialogStep: dialogStep + 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages([
          ...newMessages,
          {
            id: `msg_${Date.now()}_err`,
            role: "ai",
            content: `エラー: ${data.error ?? "応答取得失敗"}`,
          },
        ]);
        return;
      }
      setMessages([
        ...newMessages,
        {
          id: `msg_${Date.now()}_ai`,
          role: "ai",
          content: data.message ?? "",
        },
      ]);
      setDialogStep((s) => s + 1);
    } catch (e) {
      setMessages([
        ...newMessages,
        {
          id: `msg_${Date.now()}_err`,
          role: "ai",
          content: `通信エラー: ${e instanceof Error ? e.message : ""}`,
        },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateFromDialog = async () => {
    if (!selectedRole) return;
    setMode("generating");
    setGenerating(true);
    setOutput(null);
    setSaved(false);
    setErrorMsg(null);
    setGenerateProgress(0);

    const progressInterval = setInterval(() => {
      setGenerateProgress((p) => (p < 5 ? p + 1 : p));
    }, 5000);

    try {
      // 対話履歴をコンテキストとして送信
      const dialogContext = messages
        .map(
          (m) =>
            `${m.role === "ai" ? "AI" : "ユーザー"}: ${m.content}`
        )
        .join("\n\n");

      const res = await fetch("/api/growth-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          customRole,
          dialogContext,
          mode: "dialog",
        }),
      });
      const data = await res.json();
      clearInterval(progressInterval);
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "生成に失敗しました");
        setMode("dialog");
        return;
      }
      setGenerateProgress(6);
      setOutput(data as GeneratedOutput);
      setMode("result");
    } catch (e) {
      clearInterval(progressInterval);
      setErrorMsg(e instanceof Error ? e.message : "通信エラー");
      setMode("dialog");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!output || !selectedRole) return;
    setSaving(true);
    try {
      const existing = await loadPortalItems<SavedRoadmap>(
        "growth_roadmaps",
        []
      );
      const newRoadmap: SavedRoadmap = {
        id: Date.now().toString(),
        role: selectedRole,
        roleName: getRoleName(selectedRole, customRole),
        output,
        createdAt: new Date().toISOString(),
        mode: messages.length > 0 ? "dialog" : "template",
      };
      const ok = await savePortalItems("growth_roadmaps", [
        newRoadmap,
        ...existing,
      ]);
      if (ok) setSaved(true);
      else alert("Supabase保存に失敗しました（接続を確認してください）");
    } catch (e) {
      console.error(e);
      alert("保存中にエラー: " + (e instanceof Error ? e.message : ""));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMode("select");
    setSelectedRole(null);
    setCustomRole("");
    setMessages([]);
    setUserInput("");
    setOutput(null);
    setActiveTab("purpose");
    setSaved(false);
    setDialogStep(0);
    setGenerateProgress(0);
    setErrorMsg(null);
  };

  // ───────────────────────────────────────────
  // Step 1: モード・ロール選択画面
  // ───────────────────────────────────────────
  if (mode === "select") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="px-4 pt-2 pb-4">
          <h1 className="text-xl md:text-2xl font-medium text-gray-900">
            {builderTitle}
          </h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            AIと対話しながら、あなたのロールに必要なスキル・知識・マインドを一括生成します
          </p>
        </div>

        {errorMsg && (
          <div className="mx-4 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="px-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            1️⃣ ロールを選択
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roles.map((r) => {
              const baseClass = ROLE_BORDER[r.color];
              const activeClass =
                selectedRole === r.id ? ROLE_BORDER_ACTIVE[r.color] : "";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(r.id)}
                  className={`p-4 border rounded-2xl text-left transition-colors ${baseClass} ${activeClass}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{r.sub}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedRole === "custom" && (
            <div className="mt-3">
              <input
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="例: 院長秘書、受付リーダー、研修担当..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base"
              />
            </div>
          )}
        </div>

        <div className="px-4 mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            2️⃣ 生成モードを選択
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={startDialogMode}
              disabled={!isRoleReady}
              className="p-5 bg-teal-50 border border-teal-200 rounded-2xl text-left hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🤝</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-teal-900">
                    対話モード（おすすめ）
                  </p>
                  <p className="text-xs text-teal-700 mt-0.5">
                    AIが質問しながら一緒に作ります。初めての方・より詳細な資料を作りたい方向け。
                  </p>
                </div>
              </div>
              <p className="text-xs text-teal-600 bg-teal-100 rounded-lg px-3 py-2">
                所要時間: 5〜10分 ·
                AIが5〜7の質問をして、あなたの状況に合った資料を生成します
              </p>
            </button>

            <button
              type="button"
              onClick={startTemplateMode}
              disabled={!isRoleReady}
              className="p-5 bg-purple-50 border border-purple-200 rounded-2xl text-left hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-purple-900">
                    テンプレートモード（スピード重視）
                  </p>
                  <p className="text-xs text-purple-700 mt-0.5">
                    ロールを選ぶだけで即座に6種類の資料を一括生成します。
                  </p>
                </div>
              </div>
              <p className="text-xs text-purple-600 bg-purple-100 rounded-lg px-3 py-2">
                所要時間: 1〜2分 ·
                標準的なテンプレートを即生成。後から編集できます。
              </p>
            </button>
          </div>
          {!isRoleReady && (
            <p className="text-xs text-gray-600 mt-3 text-center">
              ロールを選択してください
            </p>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────
  // Step 2a: 対話モード
  // ───────────────────────────────────────────
  if (mode === "dialog") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-120px)] min-h-[500px]">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">🤝 対話モード</p>
            <p className="text-xs text-gray-600">
              {getRoleName(selectedRole, customRole)} ·
              質問{Math.min(dialogStep + 1, 6)}/6目安
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
          >
            ← 戻る
          </button>
        </div>

        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "ai" && (
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-sm flex-shrink-0 mr-2">
                  🤖
                </div>
              )}
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-teal-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {generating && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-sm flex-shrink-0 mr-2">
                🤖
              </div>
              <div className="bg-gray-100 text-gray-600 px-4 py-3 rounded-2xl rounded-tl-sm text-sm animate-pulse">
                考え中...
              </div>
            </div>
          )}

          {dialogStep >= 4 && !generating && !output && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                onClick={handleGenerateFromDialog}
                className="px-6 py-3 bg-teal-600 text-white rounded-full text-sm font-medium hover:bg-teal-700 min-h-[48px]"
              >
                ✨ この内容で6種類の資料を生成する
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-6 pt-2 border-t border-gray-100">
          <div className="flex gap-2">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleUserMessage();
                }
              }}
              placeholder="メッセージを入力..."
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-base resize-none"
            />
            <button
              type="button"
              onClick={handleUserMessage}
              disabled={!userInput.trim() || generating}
              className="px-4 bg-teal-600 text-white rounded-xl text-base hover:bg-teal-700 disabled:opacity-50 min-h-[48px]"
            >
              送信
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Shift+Enterで改行 ·
            対話が進んだら生成ボタンが表示されます
          </p>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────
  // Step 2b: 生成中画面
  // ───────────────────────────────────────────
  if (mode === "generating") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[500px] px-4">
        <div className="text-5xl mb-4 animate-bounce">✨</div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">
          6種類の資料を生成中...
        </h2>
        <p className="text-sm text-gray-600 text-center mb-6">
          AIがあなたのロールに合わせた資料を作成しています。
          <br />
          30秒〜1分ほどお待ちください。
        </p>
        <div className="w-full max-w-xs space-y-2">
          {[
            { label: "🎯 何のために（パーパス）", done: generateProgress >= 1 },
            { label: "✅ やってほしいことリスト", done: generateProgress >= 2 },
            {
              label: "📚 初心者脱却スキル・知識",
              done: generateProgress >= 3,
            },
            {
              label: "⭐ エキスパートスキル・知識",
              done: generateProgress >= 4,
            },
            { label: "📖 マニュアル（手順書）", done: generateProgress >= 5 },
            { label: "💡 マインドセット", done: generateProgress >= 6 },
          ].map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm ${
                item.done
                  ? "bg-teal-50 text-teal-700"
                  : "bg-gray-50 text-gray-400"
              }`}
            >
              <span>{item.done ? "✅" : "⏳"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────
  // Step 3: 結果表示
  // ───────────────────────────────────────────
  if (mode === "result" && output) {
    return (
      <div className="max-w-3xl mx-auto print-content">
        <div className="px-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-medium text-gray-900">
              {viewTitle}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {getRoleName(selectedRole, customRole)} 向け
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border rounded-lg no-print"
          >
            🔄 最初から
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 px-4 scrollbar-hide no-print">
          {outputTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
                activeTab === tab.id
                  ? "bg-teal-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="px-4 mt-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
              {output[activeTab]}
            </pre>
          </div>
        </div>

        <div className="px-4 mt-6 flex gap-3 flex-wrap no-print">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            className="flex-1 min-w-[160px] py-3 bg-teal-600 text-white rounded-xl text-base font-medium hover:bg-teal-700 disabled:opacity-50 min-h-[48px]"
          >
            {saved
              ? "✅ 保存済み"
              : saving
              ? "保存中..."
              : "💾 Supabaseに保存"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-3 border border-gray-200 rounded-xl text-base text-gray-600 hover:bg-gray-50 min-h-[48px]"
          >
            🖨️ 印刷
          </button>
        </div>

        {/* 印刷用に全セクションを表示（画面では非表示） */}
        <div className="hidden print:block px-4 mt-4 space-y-6">
          {outputTabs.map((tab) => (
            <div key={tab.id} className="page-break">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                {output[tab.id]}
              </pre>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
