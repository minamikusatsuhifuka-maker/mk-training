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
