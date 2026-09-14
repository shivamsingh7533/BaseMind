import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createAnnouncement,
  type Announcement,
} from "@/lib/api";

export function AnnouncePanel({
  announcements,
  onRefresh,
}: {
  announcements: Announcement[] | null;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "attention" | "error">("info");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    const res = await createAnnouncement({ title, body, severity });
    if (res) {
      setTitle("");
      setBody("");
      setSeverity("info");
      onRefresh();
    }
    setLoading(false);
  };

  function renderList() {
    if (!announcements || announcements.length === 0) {
      return (
        <div className="rounded-xl bg-slate-800/50 p-6 text-center">
          <p className="text-slate-500">No announcements yet. Create one above!</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {announcements.map((ann) => (
          <Card key={ann.id} className="border-slate-700/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-base font-semibold text-white">{ann.title}</h3>
                    <Badge
                      variant="secondary"
                      className={`gap-1 ${
                        ann.severity === "error"
                          ? "bg-red-500/20 text-red-400"
                          : ann.severity === "attention"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {ann.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-400 whitespace-pre-wrap">{ann.body}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Posted {format(new Date(ann.created_at), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-6">Announcements</h2>

        {/* Create Form */}
        <Card className="mb-6 border-slate-700/50">
          <CardHeader>
            <CardTitle className="font-heading text-base">Create Announcement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title"
                className="w-full rounded-lg bg-slate-800 border-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Announcement body (markdown supported)"
                rows={3}
                className="w-full rounded-lg bg-slate-800 border-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "info" | "attention" | "error")}
                className="w-full rounded-lg bg-slate-800 border-slate-700 px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="info">Info</option>
                <option value="attention">Attention</option>
                <option value="error">Error</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={loading || !title.trim() || !body.trim()}>
              {loading ? "Creating..." : "Post Announcement"}
            </Button>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-4">
          {renderList()}
        </div>
      </div>
    </div>
  );
}