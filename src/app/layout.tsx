import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
  ],
};

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('pp-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: light)').matches?false:true;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        <RootErrorBoundary>{children}</RootErrorBoundary>
      </body>
    </html>
  );
}
