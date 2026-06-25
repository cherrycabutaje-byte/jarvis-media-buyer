import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email || "";
    const language = body.language || "English";

    if (!email.trim() || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const response = await fetch(
      https://api.airtable.com/v0//,
      {
        method: "POST",
        headers: {
          Authorization: Bearer ,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                Emails: email,
                Language: language,
              },
            },
          ],
        }),
      }
    );

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