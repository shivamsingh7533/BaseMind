import { Suspense } from "react";
import { Chat } from "./chat";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="text-muted-foreground text-sm">Loading chat...</span></div>}>
      <Chat />
    </Suspense>
  );
}
