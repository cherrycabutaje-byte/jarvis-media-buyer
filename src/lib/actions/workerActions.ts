"use server"

import { createClient } from "@/lib/supabase/server"
import { runWorkerOnce, type WorkerRunResult } from "@/lib/worker/runWorkerOnce"

export interface RunWorkerActionResult {
  success: boolean
  data: WorkerRunResult | null
  error: string | null
}

/**
 * Server Action: triggers one worker cycle for manual testing in
 * this slice. A real background worker (a future slice) would call
 * runWorkerOnce() directly in its own process, not through this
 * browser-triggered action - this exists only so this slice can be
 * validated end-to-end without a separate worker process yet.
 */
export async function runWorkerOnceAction(): Promise<RunWorkerActionResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to run the worker." }
  }

  const workerId = `manual-worker-${Date.now()}`
  const result = await runWorkerOnce(workerId)
  return { success: true, data: result, error: null }
}