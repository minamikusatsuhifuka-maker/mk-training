// 画面を切り替えている間のスケルトン（指示書「メニュー・画面切り替えを200ms以内にする」）
// 押した瞬間に枠（見出し・カードの形）を出す。中身はその画面が読み込めたら差し替わる。
// サーバーでもブラウザでも使う（loading.tsx と、押した瞬間の切り替え NavFeedback の両方から）。
// 文言は出さない（見た目は灰色の帯だけ・機能や文言は変えない）。

export function RouteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4 p-1 md:p-2" aria-busy="true" aria-live="polite" data-route-loading>
      <span className="sr-only">読み込み中</span>
      <div className="h-7 w-48 rounded-lg bg-gray-200/80" />
      <div className="h-4 w-72 max-w-full rounded bg-gray-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-2xl bg-gray-100" />
        <div className="h-28 rounded-2xl bg-gray-100" />
        <div className="h-28 rounded-2xl bg-gray-100" />
        <div className="h-28 rounded-2xl bg-gray-100" />
      </div>
      <div className="h-40 rounded-2xl bg-gray-100" />
    </div>
  );
}
