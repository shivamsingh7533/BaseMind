import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://base-mind.vercel.app"),
  title: {
    default: "BaseMind — AI Support Agents",
    template: "%s | BaseMind",
  },
  description:
    "BaseMind turns your knowledge base into an intelligent, conversational AI support agent in minutes. Upload docs, deploy an agent, answer customer queries with cited sources.",
  keywords: [
    "AI support agent",
    "knowledge base chatbot",
    "RAG",
    "customer support automation",
    "AI chatbot for business",
    "document AI",
  ],
  authors: [
    {
      name: "Shivam Singh",
      url: "https://github.com/shivamsingh7533",
    },
  ],
  creator: "Shivam Singh — Founder & Full-Stack Engineer at BaseMind",
  publisher: "BaseMind",
  openGraph: {
    type: "website",
    url: "https://base-mind.vercel.app",
    siteName: "BaseMind",
    title: "BaseMind — AI Support Agents",
    description:
      "Transform your knowledge base into an intelligent, conversational support agent in minutes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "BaseMind — AI Support Agents",
    description:
      "Transform your knowledge base into an intelligent, conversational support agent in minutes.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://base-mind.vercel.app/#organization",
      name: "BaseMind",
      url: "https://base-mind.vercel.app",
      founder: { "@id": "https://base-mind.vercel.app/#author" },
    },
    {
      "@type": "Person",
      "@id": "https://base-mind.vercel.app/#author",
      name: "Shivam Singh",
      jobTitle: "Founder & Full-Stack Engineer at BaseMind",
      url: "https://base-mind.vercel.app",
      sameAs: ["https://github.com/shivamsingh7533"],
      worksFor: { "@id": "https://base-mind.vercel.app/#organization" },
    },
    {
      "@type": "WebSite",
      "@id": "https://base-mind.vercel.app/#website",
      url: "https://base-mind.vercel.app",
      name: "BaseMind",
      publisher: { "@id": "https://base-mind.vercel.app/#organization" },
      author: { "@id": "https://base-mind.vercel.app/#author" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geist.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
        >
          <Navbar />
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}
