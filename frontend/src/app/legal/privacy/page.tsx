import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — BaseMind",
  description:
    "How BaseMind collects, uses, and protects your data when you use the product.",
};

const SECTIONS: { h: string; body: string }[] = [
  {
    h: "Information we collect",
    body: "Account information (name, email, avatar) that you provide through your Clerk identity provider, the files and URLs you upload to build agent knowledge, the questions you ask your agents, and basic usage/analytics data collected to operate and improve the service.",
  },
  {
    h: "How we use it",
    body: "We use your data to create and run your custom agents, retrieve relevant knowledge when answering questions, display your analytics, and keep the service secure. Your uploaded files are embedded into vector search and stored so your agents can answer from them.",
  },
  {
    h: "Storage & retention",
    body: "Your data is hosted on Neon Postgres (database), Backblaze B2 (file storage), and Upstash Redis (cache). Files, conversations, and analytics are kept while your workspace is active and are deleted in full when you delete your workspace from Settings.",
  },
  {
    h: "Third-party services",
    body: "BaseMind works with Clerk (authentication), Google Gemini (embeddings and chat generation), Neon, Backblaze B2, Upstash, Vercel, and Render. Each provider processes data only on our behalf and under its own security commitments.",
  },
  {
    h: "Your rights",
    body: "You can correct or delete your account data at any time. Deleting your workspace removes your agents, knowledge, conversations, and analytics from the product — your identity-provider account itself is managed by Clerk.",
  },
  {
    h: "Contact",
    body: "Questions about this policy can be raised by opening an issue on the BaseMind GitHub repository (github.com/shivamsingh7533/BaseMind).",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to home
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated: September 2026
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="font-heading text-xl font-semibold">{s.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}