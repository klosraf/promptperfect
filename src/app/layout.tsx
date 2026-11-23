import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://promptperfect.vercel.app"),
  title: "PromptPerfect by Beagle — AI Prompt Optimizer",
  description:
    "Optimize your AI prompts for better results. Free API, Chrome extension, and web app.",
  openGraph: {
    title: "PromptPerfect — AI Prompt Optimizer",
    description:
      "Optimize your prompts. Understand every change. Open-source prompt optimization with explanations.",
    siteName: "PromptPerfect",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PromptPerfect — AI Prompt Optimizer",
    description:
      "Optimize your prompts. Understand every change. Open-source prompt optimization with explanations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <RootErrorBoundary>{children}</RootErrorBoundary>
      </body>
    </html>
  );
}
