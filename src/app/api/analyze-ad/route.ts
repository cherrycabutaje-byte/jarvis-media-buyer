import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { facebookAdExpertPrompt } from "@/lib/brains/facebookAdExpert";

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const headline = body.headline || "";
    const bodyCopy = body.bodyCopy || "";
    const audience = body.audience || "";
    const objective = body.objective || "";
    const language = body.language || "English";
    if (!headline.trim() && !bodyCopy.trim()) {
      return NextResponse.json({ error: "Please provide at least a headline or body copy." }, { status: 400 });
    }
    const isAutoDetect = language === "Auto-Detect" || language === "auto" || language === "";
    const isEnglish = language === "English";
    const li = isAutoDetect
      ? "Detect the language of the ad content and respond in that same language."
      : isEnglish
      ? "Respond in English."
      : "YOUR RESPONSE MUST BE 100% IN " + language.toUpperCase() + ".";
    const adContent = "FACEBOOK AD:\n\nHeadline: " + headline + "\nBody Copy: " + bodyCopy + "\nTarget Audience: " + audience + "\nObjective: " + objective;
    const prompt = li + "\n\nYou are JARVIS Facebook Ad Analyzer. Be brutally honest and extremely concise.\n\n" + adContent + "\n\nReturn ONLY this structure. Nothing else. No explanations.\n\nHook Score: X/10 — one sentence why.\nBiggest Problem: one sentence.\nDo This Now: one sentence.\n\n---\n\nNew Headline:\nNew Body Copy: 2-3 sentences only.\nNew CTA:";
    const jarvis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    });
    const result = (jarvis.content[0] as { text: string }).text;
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Ad analysis error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}