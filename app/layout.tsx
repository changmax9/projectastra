import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AP Mock Exam Platform",
  description: "AP-style mock exams, review guides, and performance tracking."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
