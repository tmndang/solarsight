import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolarSight — NC brownfield solar screening",
  description:
    "Screen North Carolina brownfields for a solar project of a stated size and see the tradeoffs among the sites that remain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
