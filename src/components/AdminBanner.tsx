type Props = {
  connected?: boolean;
};

export function AdminBanner({ connected = false }: Props) {
  if (connected) {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
        Supabase連携済み：編集内容は自動保存されます
      </div>
    );
  }
  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
      現在はローカルプレビュー編集です。ページをリロードするとリセットされます。Supabase連携後に永続保存が可能になります。
    </div>
  );
}
