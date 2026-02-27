import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    return NextResponse.json({ email: null });
  }
  try {
    const credentials = JSON.parse(key);
    const email = credentials.client_email ?? null;
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ email: null });
  }
}
