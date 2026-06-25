import { writeFileSync } from "fs";
const lines = [
"import Link from \"next/link\";",
"",
"export default function SuccessPage() {",
"  return (",
"    <main style={{background: \"#080b12\", minHeight: \"100vh\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\"}}>",
"      <div style={{maxWidth: \"500px\", textAlign: \"center\", padding: \"40px 20px\"}}>",
"        <div style={{fontSize: \"64px\", marginBottom: \"24px\"}}>🎉</div>",
"        <h1 style={{fontSize: \"32px\", fontWeight: \"800\", color: \"white\", marginBottom: \"16px\"}}>Welcome to JARVIS!</h1>",
"        <p style={{color: \"#94a3b8\", fontSize: \"16px\", lineHeight: \"1.6\", marginBottom: \"32px\"}}>Your subscription is active. You now have unlimited access to all 4 JARVIS intelligence tools.</p>",
"        <Link href=\"/analyze\" style={{display: \"inline-block\", padding: \"14px 32px\", background: \"#0891b2\", color: \"white\", borderRadius: \"10px\", fontWeight: \"700\", fontSize: \"15px\", textDecoration: \"none\"}}>Start Analyzing</Link>",
"      </div>",
"    </main>",
"  );",
"}",
].join("\n");
writeFileSync("src/app/success/page.tsx", lines, "utf8");
console.log("Done");