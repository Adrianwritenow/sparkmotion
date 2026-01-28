import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkMotion Hub",
  description: "NFC engagement hub",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
