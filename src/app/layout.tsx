import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/covenant/brand";
import { Shell } from "@/components/Shell";

const display = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.subtagline,
  other: {
    "fc:frame": JSON.stringify({
      version: "1",
      name: "Veklom cAPI",
      appId: "6a20f24cc341f72c2f573eb5",
    }),
    "x402:payTo": "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970",
    "x402:network": "eip155:8453",
    "x402:discovery": "/.well-known/x402.json",
    "veklom:id-wallet": "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970",
    "veklom:service": "capi",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="font-display antialiased bg-[#0B0C0E] text-[#D1D5DB]">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
