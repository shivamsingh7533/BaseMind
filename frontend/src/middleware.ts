import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/agents(.*)",
  "/knowledge-base(.*)",
  "/logs(.*)",
  "/settings(.*)",
]);

function passthrough() {
  return NextResponse.next();
}

export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect();
      }
      return NextResponse.next();
    })
  : passthrough;

export const config = {
  matcher: ["/((?!_next|[^?]*\\.[^?]*$).*)", "/(api|trpc)(.*)"],
};
