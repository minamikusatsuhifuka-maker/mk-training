// 戻ったときの表示を速くする（指示書「メニュー・画面切り替えを200ms以内にする」§2-2）
//
// このアプリの読み出しAPI（同じオリジンの GET /api/…）の返事を、ブラウザの中（このタブのメモリだけ）に少しのあいだ取り置く。
// 同じ画面に戻ったときは、取り置いた返事をすぐ渡して画面を出し、裏で必ず取り直して取り置きを新しくする（stale-while-revalidate）。
//
// 【安全のための決まり】
//   ・取り置くのは 60 秒まで。それより古いものは使わない（いつもどおり取りに行く）
//   ・GET 以外（保存・削除など）をこのアプリのAPIへ送ったら、取り置きを全部捨てる（自分の変更がすぐ出るように）
//   ・ログインしている人（セッション）が変わったら使わない（取り置きの鍵にセッションを入れる。ログアウト・別の人のログインで外れる）
//   ・JSON の 200 の返事だけ。ファイル・PDF・ストリーミング・ログイン/定期実行のAPIは対象外
//   ・ディスクには書かない（タブを閉じれば消える）
//   ・取り置きを渡すのは「別の画面から移ってきたとき」だけ（同じ画面のまま読み直すときは、いつもどおり取りに行く）
// 認証・閲覧範囲は変えない（裏の取り直しも普通の呼び出しと同じく proxy.ts とAPIの判定を通る）。

const MAX_AGE_MS = 60_000;
const MAX_ENTRIES = 200;
const EXCLUDE = [/^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/corporate-book/, /^\/api\/join/, /\/download/, /\/stream/];

type Entry = { body: string; status: number; headers: [string, string][]; at: number; nav: number };

/** 画面を移った回数（pushState/replaceState/戻る・進む で数える）。取り置いたときより後に移っていれば「戻ってきた」 */
let navCount = 0;

const store = new Map<string, Entry>();
const revalidating = new Set<string>();

/** 今のセッションの目印（Supabase のセッションCookieの先頭）。見つからなければ取り置かない */
function sessionMark(): string {
  const m = document.cookie.match(/(?:^|;\s*)(sb-[^=]+-auth-token(?:\.0)?)=([^;]{0,80})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

export function clearFetchCache(): void {
  store.clear();
}

function toResponse(e: Entry): Response {
  return new Response(e.body, { status: e.status, headers: new Headers(e.headers) });
}

async function remember(key: string, res: Response): Promise<void> {
  if (res.status !== 200) return;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return;
  try {
    const body = await res.clone().text();
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
    store.set(key, { body, status: res.status, headers: [...res.headers.entries()], at: Date.now(), nav: navCount });
  } catch {
    /* 取り置けなくても画面はふつうに動く */
  }
}

let installed = false;

export function installFetchCache(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const bump = () => {
    navCount += 1;
  };
  for (const name of ["pushState", "replaceState"] as const) {
    const orig = history[name].bind(history);
    history[name] = (...args: Parameters<History["pushState"]>) => {
      const before = window.location.pathname;
      const r = orig(...args);
      if (window.location.pathname !== before) bump();
      return r;
    };
  }
  window.addEventListener("popstate", bump);
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    let method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    try {
      url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    } catch {
      return original(input, init);
    }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return original(input, init);
    // 保存・削除など：取り置きを全部捨ててから送る（返事のあとにも捨てる＝送っている間に取り置いた分も残さない）
    if (method !== "GET" && method !== "HEAD") {
      store.clear();
      try {
        return await original(input, init);
      } finally {
        store.clear();
      }
    }
    if (EXCLUDE.some((re) => re.test(url.pathname)) || init?.cache === "reload" || init?.signal?.aborted) return original(input, init);
    const mark = sessionMark();
    if (!mark) return original(input, init);
    method = "GET";
    const key = `${mark}|${url.pathname}${url.search}`;
    const hit = store.get(key);
    if (hit && hit.nav < navCount && Date.now() - hit.at < MAX_AGE_MS) {
      // すぐ渡して、裏で取り直す（同じものを同時に何度も取り直さない）
      if (!revalidating.has(key)) {
        revalidating.add(key);
        original(input, { ...init, signal: undefined })
          .then((res) => remember(key, res))
          .catch(() => store.delete(key))
          .finally(() => revalidating.delete(key));
      }
      return toResponse(hit);
    }
    const res = await original(input, init);
    void remember(key, res);
    return res;
  };
}
