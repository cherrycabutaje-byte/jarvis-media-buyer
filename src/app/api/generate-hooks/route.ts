import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { hookGeneratorPrompt } from "@/lib/brains/hookGenerator";

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

    const content = hookGeneratorPrompt + "\n\nPRODUCT: " + product + "\nTARGET AUDIENCE: " + audience + "\nKEY BENEFIT: " + benefit + "\nTONE: " + tone + "\n\nGenerate 10 hooks now. Number them 1-10.";

    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content }]
    });

    return NextResponse.json({ result: (result.content[0] as { text: string }).text });

  } catch (error) {
    console.error("Hook generator error:", error);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
  }
}