// 資料庫のテキスト抽出（指示書86）
// - PDF は Gemini が inline_data で直接読めるため、ここでは扱わない（parse route 側で直渡し）。
// - Word(.docx)・PowerPoint(.pptx) は OOXML(zip) なので jszip で展開し、
//   本文XML内のテキストノードを連結する軽量抽出。AI要約の材料としては十分な粗抽出。
//   （mammoth 等の重い依存を足さず jszip 1つで docx/pptx 両対応する判断・指示書86）
// - 旧 .doc/.ppt（バイナリ・非zip）・破損・その他形式は ok:false を返し、UI で手入力にフォールバック。
// - extractOfficeText はサーバー（parse route）用。extractPptxSlideTexts は
//   ブラウザ内プレビュー（指示書100）でも使うクライアント/サーバ共用。

import JSZip from "jszip";
import { fileKind } from "./library";

export type ExtractResult = { text: string; ok: boolean };

// XMLタグ間のテキストノードを取り出して連結する
function collectTextNodes(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = m[1]
      .replace(/<[^>]+>/g, "") // 念のため入れ子タグ除去
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (t) out.push(t);
  }
  return out.join("");
}

async function extractDocx(zip: JSZip): Promise<string> {
  const file = zip.file("word/document.xml");
  if (!file) return "";
  const xml = await file.async("string");
  // 段落 <w:p> ごとに <w:t> を連結し、段落間に改行
  const paras = xml.split(/<\/w:p>/).map((p) => collectTextNodes(p, "w:t"));
  return paras.filter((p) => p.trim() !== "").join("\n");
}

// zip 内のスライドXMLを番号順に列挙する
function sortedSlideNames(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });
}

async function extractPptx(zip: JSZip): Promise<string> {
  const parts: string[] = [];
  for (const name of sortedSlideNames(zip)) {
    const xml = await zip.files[name].async("string");
    const text = collectTextNodes(xml, "a:t");
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n");
}

// スライドごとのテキスト抽出（ブラウザ内プレビュー用・指示書100）
// - ArrayBuffer を受けるのでブラウザでも動く。段落 <a:p> 単位で改行して読みやすくする。
// - 非zip（旧.ppt）・破損は throw（呼び出し側で非対応フォールバック）。
export async function extractPptxSlideTexts(
  data: ArrayBuffer
): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const slides: string[] = [];
  for (const name of sortedSlideNames(zip)) {
    const xml = await zip.files[name].async("string");
    const text = xml
      .split(/<\/a:p>/)
      .map((p) => collectTextNodes(p, "a:t"))
      .filter((t) => t.trim() !== "")
      .join("\n")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .trim();
    slides.push(text);
  }
  return slides;
}

// buffer からテキスト抽出。PDF はここでは扱わない（呼び出し側で Gemini 直渡し）。
export async function extractOfficeText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractResult> {
  const kind = fileKind(mimeType, fileName);
  if (kind !== "word" && kind !== "ppt") {
    return { text: "", ok: false };
  }
  try {
    const zip = await JSZip.loadAsync(buffer);
    const text =
      kind === "word" ? await extractDocx(zip) : await extractPptx(zip);
    // 制御文字（NULL等）を除去してトリム
    const trimmed = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
    if (!trimmed) return { text: "", ok: false };
    return { text: trimmed, ok: true };
  } catch {
    // 非zip（旧 .doc/.ppt）・破損などは抽出不能
    return { text: "", ok: false };
  }
}
