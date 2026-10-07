// 設備（テーブル・保管庫）が未作成のときの知らせ方（指示書212 C）
//
// 【なぜ分けるか】
// これらは「院長がSupabaseでSQLを実行すれば直る」種類の不具合で、文面には
// 指示書の番号やSQLのファイル名が入る。**スタッフにはその文を出さない。**
// スタッフには何が起きたかと、誰に伝えればよいかだけを伝える。
//
// 【出し分け】
//   スタッフ  … STAFF_INFRA_MESSAGE（この1文だけ）
//   院長      … detail（指示書の番号・SQLのファイル名を含む詳しい文）
//   サーバー  … detail を必ず console.error に残す（画面に出さなくても追える）
//
// 作りの要点: **Error の message を最初からスタッフ向けにしておく**。
// こうすると、エラーをそのまま返している既存のAPI（10本）を1本ずつ直さなくても、
// スタッフに詳しい文が出ることがない。院長向けの画面だけが detail を読む。

/** スタッフに出す文（これ以外は出さない） */
export const STAFF_INFRA_MESSAGE = "保存の仕組みに問題が起きています。院長に伝えてください。";

/**
 * 設備が未作成のときのエラー。
 * `message` はスタッフ向け・`detail` は院長向け。
 */
export class InfraMissingError extends Error {
  /** 院長向けの詳しい文（指示書の番号・SQLのファイル名を含む） */
  readonly detail: string;

  constructor(detail: string, name = "InfraMissingError") {
    super(STAFF_INFRA_MESSAGE);
    this.detail = detail;
    this.name = name;
    // サーバーの記録には必ず残す（画面に出さなくても原因を追えるように）
    console.error(`[${name}] ${detail}`);
  }
}

/** 院長の画面に出す文。詳しい文が無いときはスタッフ向けの文に落とす */
export function infraDetailOf(e: unknown): string {
  if (e instanceof InfraMissingError) return e.detail;
  return e instanceof Error ? e.message : STAFF_INFRA_MESSAGE;
}
