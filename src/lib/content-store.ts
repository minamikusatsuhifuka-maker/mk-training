// 145: anon キーでの content_store 直接アクセスを廃止し、
// content-store-core（ブラウザ=認証必須API／サーバー=service-role）経由に統一。
// localStorage フォールバックは従来どおり（オフライン・失敗時の保険）。
import {
  deleteContentRow,
  getContentRow,
  putContentRow,
} from './content-store-core'

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
    const row = await getContentRow(key)

    if (!row) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem('mk_' + key)
        if (local) return JSON.parse(local)
      }
      return defaultData
    }

    const result = row.data as T[]
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
    return await putContentRow(key, key.split('_')[0], data)
  } catch (err) {
    console.error('Save error:', err)
    return false
  }
}

// オブジェクト（配列でない設定）を取得。Supabase優先、失敗時はlocalStorage、最後にfallback。
export async function getContentObject<T>(key: string, fallback: T | null = null): Promise<T | null> {
  try {
    const row = await getContentRow(key)

    if (!row || row.data == null) {
      if (typeof window !== 'undefined') {
        const local = localStorage.getItem('mk_' + key)
        if (local) return JSON.parse(local) as T
      }
      return fallback
    }
    return row.data as T
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
    return await putContentRow(key, key.split('_')[0], data)
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
    return await deleteContentRow(key)
  } catch (err) {
    console.error('Delete error:', err)
    return false
  }
}
