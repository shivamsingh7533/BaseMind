import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const TAB_OVERVIEW = "overview";
export const TAB_TENANTS = "tenants";
export const TAB_AGENTS = "agents";
export const TAB_DOCS = "docs";
export const TAB_TRENDS = "trends";
export const TAB_ERRORS = "errors";
export const TAB_PLANS = "plans";
export const TAB_ANNOUNCE = "announce";

const TABS = [
  { key: TAB_OVERVIEW, label: "Overview" },
  { key: TAB_TENANTS, label: "Tenants" },
  { key: TAB_AGENTS, label: "Agents" },
  { key: TAB_DOCS, label: "Documents" },
  { key: TAB_TRENDS, label: "Trends" },
  { key: TAB_ERRORS, label: "Errors" },
  { key: TAB_PLANS, label: "Plans" },
  { key: TAB_ANNOUNCE, label: "Announce" },
];

export function TabsNavigation({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-3 sm:p-4 border border-slate-200/50">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              variant="outline"
              size="icon"
              className={
                `rounded-full px-4 py-2 text-sm font-medium ${
                  activeTab === tab.key
                    ? "bg-slate-900 text-white shadow-lg"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
          <Separator className="my-1" />
        </div>
      </div>
    </div>
  );
}