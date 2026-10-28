import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CAEDM News Desk", template: "%s · CAEDM News Desk" },
  description: "News intelligence and communications monitoring for the Catholic Archdiocese of Edmonton.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f1f33" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
