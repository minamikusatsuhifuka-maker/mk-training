-- 🌱 成長の行動例：今週の一歩（weekly_steps）
-- 指示書「成功の原則×行動例・考え方の例」§2 B。院長が Supabase の SQL Editor で実行する（Claude Code は実行しない）。
--
-- 【見られるのは本人だけ】RLS で auth.uid() と user_id が一致する行だけを読み書きできる。
--   院長・管理者・ほかのスタッフにも見せない。サーバーの特権キー（service role）で読む処理はアプリに作らない。
-- 【1つの期間に一歩は1つ】期間の終わり（次の日曜日）ごとに1行（user_id, end_on の組で重ならない）。途中で変更・取り消しできる。
-- 【集計しない】件数・達成率・順位をつくる仕組み（ビュー・関数）は作らない。
-- 何度実行しても同じ結果になる（IF NOT EXISTS・ポリシーは作り直す）。

create table if not exists public.weekly_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 一歩の文（ライブラリの行動例・考え方の例、または自分の言葉）
  text text not null check (char_length(text) between 1 and 300),
  -- 選んだもと（「カテゴリー › 項目」。自由記述なら空）
  source text not null default '' check (char_length(source) <= 200),
  -- 期間：選んだ日から次の日曜日まで（日本時間の日付）
  start_on date not null,
  end_on date not null check (end_on >= start_on and end_on - start_on <= 7),
  -- ふり返り：期間の終わりに自分で選ぶ（できた／もう少し）・ひとことメモ（任意）
  result text check (result in ('done', 'more')),
  memo text not null default '' check (char_length(memo) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_steps_one_per_period unique (user_id, end_on)
);

alter table public.weekly_steps enable row level security;

-- 本人だけが読み書きできる（ほかの人の行は、読めない・書けない・消せない）
drop policy if exists weekly_steps_select_own on public.weekly_steps;
drop policy if exists weekly_steps_insert_own on public.weekly_steps;
drop policy if exists weekly_steps_update_own on public.weekly_steps;
drop policy if exists weekly_steps_delete_own on public.weekly_steps;
create policy weekly_steps_select_own on public.weekly_steps for select to authenticated using (user_id = auth.uid());
create policy weekly_steps_insert_own on public.weekly_steps for insert to authenticated with check (user_id = auth.uid());
create policy weekly_steps_update_own on public.weekly_steps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weekly_steps_delete_own on public.weekly_steps for delete to authenticated using (user_id = auth.uid());

-- 未ログイン（anon）には何も許さない
revoke all on public.weekly_steps from anon;
grant select, insert, update, delete on public.weekly_steps to authenticated;

-- 更新の時刻
create or replace function public.weekly_steps_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists weekly_steps_touch on public.weekly_steps;
create trigger weekly_steps_touch before update on public.weekly_steps for each row execute function public.weekly_steps_touch();

-- PostgREST に新しい表を知らせる
notify pgrst, 'reload schema';
