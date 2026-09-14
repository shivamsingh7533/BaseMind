import { Suspense } from "react";
import { Chat } from "./chat";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}