import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { psychologistPrompt } from "@/lib/brains/psychologist";
import { mediaBuyerPrompt } from "@/lib/brains/mediaBuyer";
import { growthStrategistPrompt } from "@/lib/brains/growthStrategist";
import { offerStrategistPrompt } from "@/lib/brains/offerStrategist";
import { jarvisSynthesizerPrompt } from "@/lib/brains/jarvisSynthesizer";

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = body.input || "";
    const language = body.language || "English";
    const mode = body.mode || "full";
    if (!input.trim()) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }
    const lang = language;
    const li = lang === "English"
      ? "Respond in English."
      : "YOUR RESPONSE MUST BE 100% IN " + lang.toUpperCase() + ". NOT ONE WORD IN ENGLISH. EVERY HEADING, LABEL, SENTENCE MUST BE IN " + lang.toUpperCase() + ". THIS IS MANDATORY.";
    const mi = "MODE: " + mode + ". " + (mode === "quick" ? "Maximum 500 words." : "Maximum 900 words.");
    const expertMaxTokens = mode === "quick" ? 512 : 1024;
    const jarvisMaxTokens = mode === "quick" ? 800 : 2048;
    const mc = (p: string) => li + "\n\n" + p + "\n\n" + mi + "\n\nMarketing Information:\n" + input;
    const [ps, mb, gs, os] = await Promise.all([
      client.messages.create({ model: "claude-sonnet-4-6", max_tokens: expertMaxTokens, messages: [{ role: "user", content: mc(psychologistPrompt) }] }),
      client.messages.create({ model: "claude-sonnet-4-6", max_tokens: expertMaxTokens, messages: [{ role: "user", content: mc(mediaBuyerPrompt) }] }),
      client.messages.create({ model: "claude-sonnet-4-6", max_tokens: expertMaxTokens, messages: [{ role: "user", content: mc(growthStrategistPrompt) }] }),
      client.messages.create({ model: "claude-sonnet-4-6", max_tokens: expertMaxTokens, messages: [{ role: "user", content: mc(offerStrategistPrompt) }] }),
    ]);
    const po = (ps.content[0] as { text: string }).text;
    const mo = (mb.content[0] as { text: string }).text;
    const go = (gs.content[0] as { text: string }).text;
    const oo = (os.content[0] as { text: string }).text;
    const jc = li + "\n\n" + jarvisSynthesizerPrompt + "\n\n" + mi + "\n\n---\nCONSUMER PSYCHOLOGIST:\n" + po + "\n\n---\nMEDIA BUYER:\n" + mo + "\n\n---\nGROWTH STRATEGIST:\n" + go + "\n\n---\nOFFER STRATEGIST:\n" + oo + "\n\n---\nOriginal Marketing Information:\n" + input;
    const jarvis = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: jarvisMaxTokens, messages: [{ role: "user", content: jc }] });
    const result = (jarvis.content[0] as { text: string }).text;
    return NextResponse.json({ result });
  } catch (error) {
    console.error("JARVIS error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}