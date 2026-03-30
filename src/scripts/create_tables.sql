-- 汎用コンテンツテーブル（JSON形式で各種データを保存）
CREATE TABLE IF NOT EXISTS content_store (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT DEFAULT 'admin'
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_content_store_type ON content_store(content_type);

-- RLS（Row Level Security）を無効化（認証なしでアクセス可能）
ALTER TABLE content_store DISABLE ROW LEVEL SECURITY;

-- 各コンテンツタイプの初期レコードを挿入（upsert）
INSERT INTO content_store (id, content_type, data) VALUES
  ('cosmetic_items', 'cosmetic', '[]'::jsonb),
  ('skincare_items', 'skincare', '[]'::jsonb),
  ('pregnancy_drugs', 'pregnancy', '[]'::jsonb),
  ('drug_interactions', 'interactions', '[]'::jsonb),
  ('medical_fees', 'medical_fees', '[]'::jsonb),
  ('operations_reception', 'operations', '[]'::jsonb),
  ('operations_clerk', 'operations', '[]'::jsonb),
  ('operations_counselor', 'operations', '[]'::jsonb),
  ('counseling_guides', 'counseling', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
