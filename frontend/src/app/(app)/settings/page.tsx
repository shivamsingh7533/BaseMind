import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings — BaseMind" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Settings
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Workspace settings are coming soon.
      </p>
    </div>
  );
}
