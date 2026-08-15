import { runPublicationWorkerOnce } from "@/lib/worker/runPublicationWorkerOnce"

/**
 * Machine-only execution entry point for the Publication Worker
 * (Publication Worker Lifecycle slice). Mirrors
 * scripts/worker-run-once.ts exactly - no business logic of its
 * own, reaches the trusted Worker identity exclusively through
 * workerPublicationRepository.ts -> createWorkerClient().
 */

async function main() {
  try {
    const result = await runPublicationWorkerOnce()

    for (const line of result.logLines) {
      console.log(line)
    }

    if (!result.claimed) {
      console.log("[publication-worker-run-once] No publication was available. Exiting successfully.")
      process.exit(0)
    }

    console.log(`[publication-worker-run-once] Cycle complete. publicationId=${result.publicationId}`)
    process.exit(0)
  } catch (err) {
    console.error(
      `[publication-worker-run-once] Unexpected failure: ${err instanceof Error ? err.message : String(err)}`
    )
    process.exit(1)
  }
}

main()