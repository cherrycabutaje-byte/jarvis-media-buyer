import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository";
import AppShellClient from "@/components/AppShellClient";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id);
  const workspaces = workspacesResult.data ?? [];
  const activeWorkspaceId = workspaces[0]?.id ?? null;

  return (
    <AppShellClient
      userEmail={userData.user.email ?? ""}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
      activeWorkspaceId={activeWorkspaceId}
    >
      {children}
    </AppShellClient>
  );
}