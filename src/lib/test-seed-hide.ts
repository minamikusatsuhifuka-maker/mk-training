// 検証用アカウントとその中身を、本物のスタッフ・幹部から隠す（指示書237）— 純関数・依存なし
//
// 【決まり】見る人が「院長」か「検証用アカウント」なら全部見せる。それ以外（本物のスタッフ・委任された本物の幹部）には、
//   検証用アカウント（テスト花子・テスト次郎）の名前・投稿・反応・記録を外して渡す。判定はサーバーだけで行う。
//
// 【共有の保存場所で気をつけること】content_store の共有キー（気づき・朝礼・タスク・リアクションなど）は、
//   画面が「全体を読む → 直す → 全体を書き戻す」作り。読むときに隠すだけだと、本物のスタッフが保存した瞬間に
//   検証用の中身が消える（院長の決定「中身を残す」に反する）。そこで、書くときは restoreHidden で
//   「隠していた分」を今の保存値から戻してから保存する。
//
// 【見分け方】配列の中の1件（オブジェクト）に、検証用アカウントの id か名前が入っていたら、その1件ごと外す。
//   ・id の欄: authorId / userId / createdById / byUserId / reactorId / ownerId / staffId / id（値が検証用アカウントの id と一致したときだけ）
//   ・名前の欄: authorName / author / fromName / toName / name / createdBy / actor / userName / uploadedBy / byName / assignee
//   ・名前だけの配列（担当者など）は、検証用アカウントの名前の文字列だけを外す
//   ・userId をキーにした入れ物（{ <userId>: … }）は、そのキーを外す
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。

export type TestSeedHideContext = {
  /** 検証用アカウントの userId */
  ids: ReadonlySet<string>;
  /** 検証用アカウントの名前（表示名・プロフィールの名前） */
  names: ReadonlySet<string>;
};

const ID_FIELDS = ["authorId", "userId", "createdById", "byUserId", "reactorId", "ownerId", "staffId", "id"] as const;
const NAME_FIELDS = [
  "authorName",
  "author",
  "fromName",
  "toName",
  "name",
  "createdBy",
  "actor",
  "userName",
  "uploadedBy",
  "byName",
  "assignee",
] as const;

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function hasTestSeed(ctx: TestSeedHideContext): boolean {
  return ctx.ids.size > 0 || ctx.names.size > 0;
}

/** その1件が検証用アカウントのものか */
export function isTestSeedItem(v: Json, ctx: TestSeedHideContext): boolean {
  if (typeof v === "string") return ctx.names.has(v.trim());
  if (!isObj(v)) return false;
  for (const f of ID_FIELDS) {
    const x = v[f];
    if (typeof x === "string" && ctx.ids.has(x)) return true;
  }
  for (const f of NAME_FIELDS) {
    const x = v[f];
    if (typeof x === "string" && x.trim() && ctx.names.has(x.trim())) return true;
  }
  return false;
}

/** 検証用アカウントの分を外した写しを返す（元の値は変えない） */
export function hideTestSeed<T extends Json>(data: T, ctx: TestSeedHideContext): T {
  if (!hasTestSeed(ctx)) return data;
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.filter((it) => !isTestSeedItem(it, ctx)).map(walk);
    if (isObj(v)) {
      const out: Record<string, Json> = {};
      for (const [k, x] of Object.entries(v)) {
        if (ctx.ids.has(k)) continue; // userId をキーにした入れ物
        out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(data) as T;
}

// ─── 書くとき：隠していた分を戻す ───

/** 配列の中で、同じ1件を見つけるための目印（id があれば id、無ければ順番） */
type Step = { key: string } | { id: string } | { index: number };

function itemId(v: Json): string | null {
  return isObj(v) && typeof v.id === "string" && v.id ? v.id : null;
}

function locate(root: Json, path: readonly Step[]): Json | undefined {
  let cur: Json = root;
  for (const s of path) {
    if ("key" in s) {
      if (!isObj(cur)) return undefined;
      cur = cur[s.key];
    } else if ("id" in s) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((it) => itemId(it) === s.id);
    } else {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[s.index];
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * 今の保存値（current）にあって、本物のスタッフには隠していた検証用の分を、書き込まれる値（incoming）に戻す。
 *   ・配列：検証用の1件のうち、incoming の同じ場所に無いものを末尾に足す（同じ中身なら足さない）
 *   ・userId をキーにした入れ物：検証用アカウントのキーが incoming に無ければ戻す
 * 場所が incoming に無い（その入れ物ごと消された）ときは戻さない＝本物の操作を優先する。
 */
export function restoreHidden<T extends Json>(current: Json, incoming: T, ctx: TestSeedHideContext): T {
  if (!hasTestSeed(ctx) || current === undefined || current === null) return incoming;
  const out = JSON.parse(JSON.stringify(incoming ?? null)) as Json;
  const visit = (cur: Json, path: Step[]) => {
    if (Array.isArray(cur)) {
      const target = locate(out, path);
      cur.forEach((it, i) => {
        if (isTestSeedItem(it, ctx)) {
          if (Array.isArray(target)) {
            const s = JSON.stringify(it);
            const id = itemId(it);
            const present = target.some((t) => (id ? itemId(t) === id : JSON.stringify(t) === s));
            if (!present) target.push(it);
          }
          return;
        }
        const id = itemId(it);
        visit(it, [...path, id ? { id } : { index: i }]);
      });
      return;
    }
    if (isObj(cur)) {
      const target = locate(out, path);
      for (const [k, x] of Object.entries(cur)) {
        if (ctx.ids.has(k)) {
          if (isObj(target) && !(k in target)) target[k] = x;
          continue;
        }
        visit(x, [...path, { key: k }]);
      }
    }
  };
  visit(current, []);
  return out as T;
}
