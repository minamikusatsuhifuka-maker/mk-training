type Props = {
  connected?: boolean;
};

export function AdminBanner({ connected = false }: Props) {
  if (connected) {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
        Supabase連携済み：編集内容は全スタッフに即時反映されます
      </div>
    );
  }
  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
      ローカルモード：編集内容はこのブラウザのみに保存されます
    </div>
  );
}
