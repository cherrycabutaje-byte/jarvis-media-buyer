"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "starter";

  useEffect(() => {
    async function redirect() {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    }
    redirect();
  }, [plan]);

  return (
    <main style={{background: "#080b12", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center"}}>
      <div style={{textAlign: "center"}}>
        <div style={{color: "#22d3ee", fontSize: "18px", fontWeight: "600"}}>Redirecting to checkout...</div>
        <div style={{color: "#475569", fontSize: "14px", marginTop: "8px"}}>Please wait.</div>
      </div>
    </main>
  );
}