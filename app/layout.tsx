import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Astra Exams",
  title: {
    default: "Astra Exams",
    template: "%s | Astra Exams"
  },
  description: "Timed AP practice tests, review guides, and saved progress.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/favicon.ico"
  }
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#e7edf9"
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
