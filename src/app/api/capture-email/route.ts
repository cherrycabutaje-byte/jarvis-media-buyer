import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email || "";
    const language = body.language || "English";

    if (!email.trim() || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;
    const apiKey = process.env.AIRTABLE_API_KEY;
    const url = "https://api.airtable.com/v0/" + baseId + "/" + tableName;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [{ fields: { Emails: email, Language: language } }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Airtable error:", error);
      return NextResponse.json({ error: "Failed to save email." }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Email capture error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}