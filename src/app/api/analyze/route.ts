import OpenAI from "openai";
import { NextResponse } from "next/server";

import { psychologistPrompt } from "@/lib/brains/psychologist";
import { mediaBuyerPrompt } from "@/lib/brains/mediaBuyer";
import { growthStrategistPrompt } from "@/lib/brains/growthStrategist";
import { offerStrategistPrompt } from "@/lib/brains/offerStrategist";

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
try {
const body = await req.json();
const input = body.input || "";


const prompt = `


${psychologistPrompt}

${mediaBuyerPrompt}

${growthStrategistPrompt}

${offerStrategistPrompt}

You are JARVIS.

All experts have completed their analysis.

Your task is to synthesize all expert viewpoints.

Do not repeat observations.

Reveal:

# WHAT IS WORKING

Identify the strongest parts of the marketing.

Explain what is currently helping performance.

# WHY IT IS WORKING

Explain the psychology, messaging, positioning, trust factors, and audience alignment that make it effective.

# WHAT IS NOT WORKING

Identify the weakest parts of the marketing.

Explain what is limiting performance.

# WHY IT IS FAILING

Explain the deeper reason behind the weakness.

Focus on psychology, positioning, trust, offer strength, market sophistication, and audience fit.

# JARVIS DECONSTRUCTION

Break down:

* Format
* Messaging
* Psychology
* Market Awareness
* Trust
* Competitive Position
* Scalability

Explain how each affects performance.

# WHAT TO DO NEXT

Provide the 3 highest leverage actions.

Rank them by impact.

For each action explain:

* Why it matters
* Expected impact
* Difficulty level


# EXECUTIVE ACTION PLAN

Create an implementation plan.

Priority 1

- Action:
- Reason:
- Expected Impact:
- Difficulty:
- Confidence:
- Time Required:
- Cost Required:
- Expected ROI (Low / Medium / High):
- Dependencies:

Priority 2

- Action:
- Reason:
- Expected Impact:
- Difficulty:
- Confidence:
- Time Required:
- Cost Required:
- Expected ROI (Low / Medium / High):
- Dependencies:

Priority 3

- Action:
- Reason:
- Expected Impact:
- Difficulty:
- Confidence:
- Time Required:
- Cost Required:
- Expected ROI (Low / Medium / High):
- Dependencies:

Focus on actions that can realistically be executed immediately.

# FASTEST WIN

What can be changed immediately for the biggest gain?

Provide:

* The exact change
* Why it should work
* Expected outcome



# CONFIDENCE ENGINE

For each major conclusion provide:

* Evidence Score (1-10)
* Assumption Score (1-10)
* Action Risk (Low / Medium / High)
* Confidence Level (Low / Medium / High)

Explain why.

# DECISION SUMMARY

If you could only do ONE thing:

- Recommended Action:
- Why:
- Expected Outcome:

If you could only do THREE things:

1.
2.
3.

Explain why these actions have the highest leverage.

# FINAL VERDICT

Provide an executive summary.

Think like a senior media buyer, strategist, and operator.

Focus on diagnosis first.

Then recommendations.

Marketing Information:

${input}
`;


const response = await openai.responses.create({
  model: "gpt-5.5",
  input: prompt,
});

return NextResponse.json({
  result: response.output_text,
});


} catch (error) {
console.error(error);


return NextResponse.json(
  {
    error: "Analysis failed",
  },
  {
    status: 500,
  }
);


}
}
