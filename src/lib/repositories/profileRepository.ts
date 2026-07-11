import { createClient } from '@/lib/supabase/server'

export interface Profile {
  id: string
  display_name: string | null
  created_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Fetches a single profile by user id.
 */
export async function getProfileById(userId: string): Promise<RepositoryResult<Profile>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('id', userId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Profile, error: null }
}

/**
 * Updates a profile's display_name and returns the updated row.
 */
export async function updateDisplayName(
  userId: string,
  displayName: string
): Promise<RepositoryResult<Profile>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('id, display_name, created_at')
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Profile, error: null }
}

/**
 * NOT YET SUPPORTED.
 *
 * The `profiles` table (Database Version 1.0, migration 001) currently
 * has exactly three columns: id, display_name, created_at - confirmed
 * by direct inspection of the live database. There is no avatar_url
 * column. This function exists as a documented extension point only;
 * it deliberately throws rather than silently failing or writing to a
 * column that doesn't exist. Implementing it for real requires a
 * future, separately-approved migration that adds an avatar_url
 * column to profiles - Database Version 1.0 remains frozen until then.
 */
export async function updateAvatarUrl(
  _userId: string,
  _avatarUrl: string
): Promise<RepositoryResult<Profile>> {
  throw new Error(
    'updateAvatarUrl is not yet supported: profiles has no avatar_url column in the current frozen schema (Database Version 1.0). This requires a future, approved migration first.'
  )
}