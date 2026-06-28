import { supabase } from './supabase'

export const CONTENT_KEYS = {
  cosmetic: 'cosmetic_items',
  skincare: 'skincare_items',
  pregnancy: 'pregnancy_drugs',
  interactions: 'drug_interactions',
  medicalFees: 'medical_fees',
  operationsReception: 'operations_reception',
  operationsClerk: 'operations_clerk',
  operationsCounselor: 'operations_counselor',
  counseling: 'counseling_guides',
  diseases: 'content_diseases',
  drugs: 'content_drugs',
  quiz: 'content_quiz',
  contraindications: 'content_contraindications',
  biologics: 'biologics_data',
  expertRoles: 'expert_roles',
  navConfig: 'portal_nav_config',
} as const

// データを取得（Supabase優先、失敗時はlocalStorageにフォールバック）
export async function getContent<T>(key: string, defaultData: T[]): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from('content_store')
      .select('data')
      .eq('id', key)
      .single()

    if (error || !data) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem('mk_' + key)
        if (local) return JSON.parse(local)
      }
      return defaultData
    }

    const result = data.data as T[]
    if (!result || (Array.isArray(result) && result.length === 0)) return defaultData
    return result
  } catch {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('mk_' + key)
      if (local) return JSON.parse(local)
    }
    return defaultData
  }
}

// データを保存（Supabase + localStorageの両方に保存）
export async function saveContent<T>(key: string, data: T[]): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('mk_' + key, JSON.stringify(data))
    } catch { /* ignore */ }
  }

  try {
    const { error } = await supabase
      .from('content_store')
      .upsert({
        id: key,
        content_type: key.split('_')[0],
        data: data as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Supabase save error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('Save error:', err)
    return false
  }
}

// オブジェクト（配列でない設定）を取得。Supabase優先、失敗時はlocalStorage、最後にfallback。
export async function getContentObject<T>(key: string, fallback: T | null = null): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('content_store')
      .select('data')
      .eq('id', key)
      .single()

    if (error || !data || data.data == null) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem('mk_' + key)
        if (local) return JSON.parse(local) as T
      }
      return fallback
    }
    return data.data as T
  } catch {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('mk_' + key)
      if (local) return JSON.parse(local) as T
    }
    return fallback
  }
}

// オブジェクト（配列でない設定）を保存。
export async function saveContentObject<T>(key: string, data: T): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('mk_' + key, JSON.stringify(data))
    } catch { /* ignore */ }
  }

  try {
    const { error } = await supabase
      .from('content_store')
      .upsert({
        id: key,
        content_type: key.split('_')[0],
        data: data as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Supabase save error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('Save error:', err)
    return false
  }
}

// 設定を削除して既定（フォールバック）に戻す。
export async function deleteContent(key: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('mk_' + key)
    } catch { /* ignore */ }
  }

  try {
    const { error } = await supabase.from('content_store').delete().eq('id', key)
    if (error) {
      console.error('Supabase delete error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('Delete error:', err)
    return false
  }
}
