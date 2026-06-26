import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const product = body.product || "";
    const audience = body.audience || "";
    const benefit = body.benefit || "";
    const tone = body.tone || "Direct";
    if (!product.trim()) {
      return NextResponse.json({ error: "Please provide your product details." }, { status: 400 });
    }
    const prompt = "You are JARVIS Hook Generator. Generate 10 scroll-stopping hooks.\n\nPRODUCT: " + product + "\nAUDIENCE: " + audience + "\nKEY BENEFIT: " + benefit + "\nTONE: " + tone + "\n\nReturn ONLY this format. Nothing else:\n\n1. [Hook] — [Trigger] — High/Medium\n2. [Hook] — [Trigger] — High/Medium\n3. [Hook] — [Trigger] — High/Medium\n4. [Hook] — [Trigger] — High/Medium\n5. [Hook] — [Trigger] — High/Medium\n6. [Hook] — [Trigger] — High/Medium\n7. [Hook] — [Trigger] — High/Medium\n8. [Hook] — [Trigger] — High/Medium\n9. [Hook] — [Trigger] — High/Medium\n10. [Hook] — [Trigger] — High/Medium\n\nEach hook must be specific to this product. No generic hooks.";
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }]
    });
    return NextResponse.json({ result: (result.content[0] as { text: string }).text });
  } catch (error) {
    console.error("Hook generator error:", error);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
  }
}