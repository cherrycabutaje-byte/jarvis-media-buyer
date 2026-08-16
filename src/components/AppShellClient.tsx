"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Workspace {
  id: string;
  name: string;
}

interface AppShellClientProps {
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/media-buyer", label: "Media Buyer", icon: "target" },
];

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "grid") {
    return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
  }
  if (name === "target") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></svg>;
  }
  if (name === "menu") {
    return <svg {...common}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
  }
  if (name === "close") {
    return <svg {...common}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
  }
  if (name === "chevronDown") {
    return <svg {...common}><polyline points="6 9 12 15 18 9" /></svg>;
  }
  return null;
}

export default function AppShellClient({ userEmail, workspaces, activeWorkspaceId, children }: AppShellClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const sidebarContent = (
    <>
      <div style={{ padding: "24px 20px 20px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "34px", height: "34px", borderRadius: "9px", background: "linear-gradient(135deg, #22d3ee, #0891b2)",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "15px", color: "#04141a", flexShrink: 0,
        }}>J</div>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "0.02em" }}>JARVIS Logic</div>
        </div>
      </div>

      <nav style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", borderRadius: "9px",
                fontSize: "14px", fontWeight: isActive ? 600 : 500, textDecoration: "none",
                color: isActive ? "#22d3ee" : "#94a3b8",
                background: isActive ? "rgba(34,211,238,0.08)" : "transparent",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}

        <div style={{
          display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", borderRadius: "9px",
          fontSize: "14px", fontWeight: 500, color: "#475569", cursor: "default", marginTop: "4px",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          Account
          <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: "#475569", background: "#1e293b", padding: "2px 7px", borderRadius: "999px", letterSpacing: "0.03em" }}>SOON</span>
        </div>
      </nav>

      <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid #1e293b" }}>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
        <button
          onClick={handleLogout}
          style={{
            width: "100%", padding: "9px 12px", background: "transparent", border: "1px solid #1e293b", borderRadius: "8px",
            color: "#94a3b8", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", display: "flex" }}>
      {/* Desktop sidebar */}
      <aside style={{
        width: "252px", flexShrink: 0, borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
      }} className="jarvis-sidebar-desktop">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }}
          className="jarvis-sidebar-overlay"
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "252px", height: "100vh", background: "#080b12", borderRight: "1px solid #1e293b",
              display: "flex", flexDirection: "column", position: "relative", zIndex: 41,
            }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <header style={{
          height: "60px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, background: "#080b12", zIndex: 20,
        }}>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="jarvis-menu-btn"
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "6px", display: "none" }}
          >
            <Icon name="menu" />
          </button>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setWorkspaceMenuOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#0f172a",
                border: "1px solid #1e293b", borderRadius: "9px", color: "#e2e8f0", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {activeWorkspace ? activeWorkspace.name : "No workspace"}
              <Icon name="chevronDown" />
            </button>
            {workspaceMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: "220px", background: "#0f172a",
                border: "1px solid #1e293b", borderRadius: "10px", padding: "6px", zIndex: 30, boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
              }}>
                {workspaces.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: "13px", color: "#64748b" }}>No workspaces yet</div>
                ) : (
                  workspaces.map((w) => (
                    <div key={w.id} style={{
                      padding: "9px 12px", fontSize: "13px", color: w.id === activeWorkspace?.id ? "#22d3ee" : "#e2e8f0",
                      borderRadius: "7px", cursor: "default", fontWeight: w.id === activeWorkspace?.id ? 600 : 500,
                    }}>
                      {w.name}
                    </div>
                  ))
                )}
                <div style={{ borderTop: "1px solid #1e293b", marginTop: "4px", paddingTop: "4px" }}>
                  <Link href="/workspaces/new" style={{
                    display: "block", padding: "9px 12px", fontSize: "13px", color: "#22d3ee", textDecoration: "none", fontWeight: 600,
                  }}>
                    + New workspace
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div style={{ width: "18px" }} />
        </header>

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .jarvis-sidebar-desktop { display: none; }
          .jarvis-menu-btn { display: inline-flex !important; }
        }
        @media (min-width: 861px) {
          .jarvis-sidebar-overlay { display: none; }
        }
      `}</style>
    </div>
  );
}