import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "일정 예약 프로그램",
  description: "일정 예약 프로그램 - 행사, 청소, 당번 등 일정을 만들고 신청받기",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={openSans.className}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
