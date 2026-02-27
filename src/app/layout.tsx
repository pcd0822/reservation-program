import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "행사·청소·당번 예약",
  description: "학교 행사, 청소, 당번 예약 프로그램",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
