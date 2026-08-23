"use server"

import { createClient } from "@/lib/supabase/server"
import { updateOwnerGuardrails, getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import type { BusinessObjective, AuthorityMode } from "@/lib/product/ownerGuardrails"

export interface SetOwnerGuardrailsResult {
  success: boolean
  error: string | null
}

/**
 * Owner Goals + Budget + Risk Guardrails V1 Server Action.
 *
 * Never invents or defaults a value the customer did not explicitly
 * supply. Ownership verified via workspace membership before any
 * write. Uses the human-session server client - never service-role.
 */
export async function setOwnerGuardrailsAction(
  brandId: string,
  updates: {
    objective?: BusinessObjective | null
    targetRoas?: number | null
    targetCpaCents?: number | null
    monthlyBudgetCents?: number | null
    dailyMaximumCents?: number | null
    maxTestBudgetCents?: number | null
    budgetCurrency?: string | null
    authorityMode?: AuthorityMode
  }
): Promise<SetOwnerGuardrailsResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in." }
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Brand not found." }
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to modify this brand's settings." }
  }

  const result = await updateOwnerGuardrails(brandId, {
    objective: updates.objective,
    target_roas: updates.targetRoas,
    target_cpa_cents: updates.targetCpaCents,
    monthly_budget_cents: updates.monthlyBudgetCents,
    daily_maximum_cents: updates.dailyMaximumCents,
    max_test_budget_cents: updates.maxTestBudgetCents,
    budget_currency: updates.budgetCurrency,
    authority_mode: updates.authorityMode,
  })

  if (result.error) {
    return { success: false, error: result.error }
  }
  return { success: true, error: null }
}
