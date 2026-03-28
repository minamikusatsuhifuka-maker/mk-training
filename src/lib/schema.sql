-- プロフィールテーブル（auth.usersと1対1）
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "自分のプロフィールは自分だけ読める" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "管理者は全プロフィールを読める" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "自分のプロフィールは自分が更新できる" ON profiles FOR UPDATE USING (auth.uid() = id);

-- クイズ結果テーブル
CREATE TABLE quiz_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "自分の結果は自分だけ読める" ON quiz_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "管理者は全結果を読める" ON quiz_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "自分の結果は自分が書ける" ON quiz_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- チェックリスト進捗テーブル
CREATE TABLE checklist_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  checklist_key TEXT NOT NULL,
  checked_items JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, checklist_key)
);
ALTER TABLE checklist_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "自分の進捗は自分だけ読める" ON checklist_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "自分の進捗は自分が書ける" ON checklist_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "自分の進捗は自分が更新できる" ON checklist_progress FOR UPDATE USING (auth.uid() = user_id);

-- コンテンツテーブル（管理画面からの編集を永続保存）
CREATE TABLE content_diseases (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE content_diseases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "全員が読める" ON content_diseases FOR SELECT USING (true);
CREATE POLICY "管理者だけが書ける" ON content_diseases FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE TABLE content_drugs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE content_drugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "全員が読める" ON content_drugs FOR SELECT USING (true);
CREATE POLICY "管理者だけが書ける" ON content_drugs FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE TABLE content_quiz (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE content_quiz ENABLE ROW LEVEL SECURITY;
CREATE POLICY "全員が読める" ON content_quiz FOR SELECT USING (true);
CREATE POLICY "管理者だけが書ける" ON content_quiz FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- プロフィール自動作成トリガー
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
