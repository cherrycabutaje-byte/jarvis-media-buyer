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

    if (!input.trim()) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    // Step 1: Run all 4 experts in parallel
    const [psychologist, mediaBuyer, growthStrategist, offerStrategist] = await Promise.all([
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `${psychologistPrompt}\n\nMarketing Information:\n${input}`
        }]
      }),
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `${mediaBuyerPrompt}\n\nMarketing Information:\n${input}`
        }]
      }),
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `${growthStrategistPrompt}\n\nMarketing Information:\n${input}`
        }]
      }),
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `${offerStrategistPrompt}\n\nMarketing Information:\n${input}`
        }]
      }),
    ]);

    const psychologistOutput = (psychologist.content[0] as { text: string }).text;
    const mediaBuyerOutput = (mediaBuyer.content[0] as { text: string }).text;
    const growthStrategistOutput = (growthStrategist.content[0] as { text: string }).text;
    const offerStrategistOutput = (offerStrategist.content[0] as { text: string }).text;

    // Step 2: JARVIS synthesizes all expert output
    const jarvis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `${jarvisSynthesizerPrompt}

---
CONSUMER PSYCHOLOGIST ANALYSIS:
${psychologistOutput}

---
MEDIA BUYER ANALYSIS:
${mediaBuyerOutput}

---
GROWTH STRATEGIST ANALYSIS:
${growthStrategistOutput}

---
OFFER STRATEGIST ANALYSIS:
${offerStrategistOutput}

---
Original Marketing Information:
${input}`
      }]
    });

    const result = (jarvis.content[0] as { text: string }).text;

    return NextResponse.json({ result });

  } catch (error) {
    console.error("JARVIS error:", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
