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

    const lang = language;
    const li = lang === "English" ? "Respond in English." : "YOUR RESPONSE MUST BE 100% IN " + lang.toUpperCase() + ". NOT ONE WORD IN ENGLISH. EVERY HEADING, LABEL, SENTENCE MUST BE IN " + lang.toUpperCase() + ".";

    const adContent = "FACEBOOK AD:\n\nHeadline: " + headline + "\nBody Copy: " + bodyCopy + "\nTarget Audience: " + audience + "\nObjective: " + objective;

    const adAnalysis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: li + "\n\n" + facebookAdExpertPrompt + "\n\n" + adContent }]
    });

    const adOutput = (adAnalysis.content[0] as { text: string }).text;

    const synthPrompt = li + "\n\nYou are JARVIS. A Facebook ad creative expert has analyzed this ad.\n\nYour job is to synthesize the findings into a sharp actionable report.\nMaximum 600 words. No repetition.\n\nAD EXPERT ANALYSIS:\n" + adOutput + "\n\n" + adContent + "\n\nReturn EXACTLY this structure:\n\n## JARVIS VERDICT\n> **Hook Score:** Rate 1-10 and one sentence why.\n> **Biggest Problem:** One sentence.\n> **Do This Now:** One sentence.\n\n---\n\n# CREATIVE ANALYSIS\n**Hook:** Is it strong enough to stop the scroll?\n**Emotion:** What emotion is being triggered and is it the right one?\n**Audience Match:** Does this speak directly to the target audience?\n**Conversion Risk:** The single biggest reason people will not click.\n\n# THE WINNING AD\nRewrite this ad to maximize conversions:\n\n**New Headline:**\n**New Body Copy:**\n**New CTA:**\n**Why This Works:**";

    const jarvis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: synthPrompt }]
    });

    const result = (jarvis.content[0] as { text: string }).text;
    return NextResponse.json({ result });

  } catch (error) {
    console.error("Ad analysis error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}