export function AdminBanner() {
  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
      現在はローカルプレビュー編集です。ページをリロードするとリセットされます。Supabase連携後に永続保存が可能になります。
    </div>
  );
}
