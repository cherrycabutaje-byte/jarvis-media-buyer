import { runWorkerOnce } from "@/lib/worker/runWorkerOnce"

/**
 * Machine-only execution entry point (Authenticated Worker RPC
 * Isolation slice). Proves the full chain:
 *   machine process -> runWorkerOnce() -> workerJobRepository ->
 *   createWorkerClient() -> elevated Supabase Worker identity.
 *
 * Contains NO Worker business logic of its own - it only imports
 * and calls the existing, unmodified runWorkerOnce(), which itself
 * reaches the trusted Worker identity exclusively through
 * workerJobRepository.ts -> createWorkerClient(). This script never
 * constructs a Supabase client directly and never reads
 * SUPABASE_SECRET_KEY itself - that happens only inside worker.ts,
 * one layer away from this file.
 *
 * Prints only the safe, already-non-secret log lines runWorkerOnce()
 * itself produces (job found/not found, job id, status/result
 * classification) - never any credential, environment-variable
 * value, or decrypted secret.
 */

async function main() {
  const workerId = `machine-worker-${Date.now()}`

  try {
    const result = await runWorkerOnce(workerId)

    for (const line of result.logLines) {
      console.log(line)
    }

    if (!result.claimed) {
      console.log("[worker-run-once] No job was available. Exiting successfully.")
      process.exit(0)
    }

    console.log(`[worker-run-once] Cycle complete. jobId=${result.jobId}, jobType=${result.jobType}`)
    process.exit(0)
  } catch (err) {
    console.error(
      `[worker-run-once] Unexpected failure: ${err instanceof Error ? err.message : String(err)}`
    )
    process.exit(1)
  }
}

main()