import { writeFileSync } from "fs";

const spyRoute = [
"import Anthropic from \"@anthropic-ai/sdk\";",
"import { NextResponse } from \"next/server\";",
"",
"const client = new Anthropic();",
"",
"export async function POST(req: Request) {",
"  try {",
"    const body = await req.json();",
"    const competitorHeadline = body.competitorHeadline || \"\";",
"    const competitorBody = body.competitorBody || \"\";",
"    const yourProduct = body.yourProduct || \"\";",
"    const audience = body.audience || \"\";",
"    if (!competitorHeadline.trim() && !competitorBody.trim()) {",
"      return NextResponse.json({ error: \"Please provide the competitor ad.\" }, { status: 400 });",
"    }",
"    const adContent = \"COMPETITOR AD:\\n\\nHeadline: \" + competitorHeadline + \"\\nBody Copy: \" + competitorBody + \"\\n\\nYOUR PRODUCT: \" + yourProduct + \"\\nTARGET AUDIENCE: \" + audience;",
"    const prompt = \"You are JARVIS Competitor Intelligence. Be brutally concise.\\n\\n\" + adContent + \"\\n\\nReturn ONLY this structure. Nothing else. No explanations.\\n\\nTheir Angle: one sentence.\\nTheir Weakness: one sentence.\\nYour Winning Move: one sentence.\\n\\n---\\n\\nYour Winning Ad:\\nHeadline:\\nBody Copy: 2-3 sentences only.\\nCTA:\";",
"    const jarvis = await client.messages.create({",
"      model: \"claude-sonnet-4-6\",",
"      max_tokens: 400,",
"      messages: [{ role: \"user\", content: prompt }]",
"    });",
"    const result = (jarvis.content[0] as { text: string }).text;",
"    return NextResponse.json({ result });",
"  } catch (error) {",
"    console.error(\"Competitor spy error:\", error);",
"    return NextResponse.json({ error: \"Analysis failed. Please try again.\" }, { status: 500 });",
"  }",
"}",
].join("\n");

writeFileSync("src/app/api/analyze-competitor/route.ts", spyRoute, "utf8");
console.log("Competitor spy done");