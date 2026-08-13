import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Trusted server-side Worker Supabase client factory.
 *
 * This is the ONLY client in this project authenticated as the
 * elevated Supabase server identity (SUPABASE_SECRET_KEY -> the
 * service_role database role). It is deliberately separate from
 * src/lib/supabase/client.ts (browser, anon key) and
 * src/lib/supabase/server.ts (human session, anon key + cookies).
 *
 * There is no human session concept here at all - no cookies, no
 * @supabase/ssr, no auth.uid(). This client exists solely for the
 * trusted machine Worker execution path (Authenticated Worker RPC
 * Isolation slice) and must never be imported by any code reachable
 * from a browser session or an ordinary authenticated Server Action.
 *
 * The "server-only" import above causes the Next.js build itself to
 * fail if this module is ever pulled into a client bundle - a
 * build-time guarantee, not just a code-review convention.
 *
 * Both required environment values are validated explicitly here,
 * with controlled, descriptive errors - never a silent non-null
 * assertion that would surface as an opaque runtime failure deep
 * inside a Supabase client call instead. Neither value is ever
 * logged, returned, or included in any error message's content.
 */

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(
      `Worker configuration error: ${name} is not set. The trusted Worker client cannot be created without it.`
    )
  }
  return value
}

export function createWorkerClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseSecretKey = requireEnv("SUPABASE_SECRET_KEY")

  return createClient(supabaseUrl, supabaseSecretKey)
}