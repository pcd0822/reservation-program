import { NextResponse } from "next/server";

// 빌드 때 결과가 굳지 않도록 요청마다 실행(환경 변수를 바꾼 뒤 재배포 없이도 반영)
export const dynamic = "force-dynamic";

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
