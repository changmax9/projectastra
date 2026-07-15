import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Astra Exams",
  description: "Timed AP practice tests, review guides, and saved progress."
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
