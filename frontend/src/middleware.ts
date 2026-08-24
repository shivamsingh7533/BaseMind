import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/agents(.*)",
  "/knowledge-base(.*)",
  "/logs(.*)",
  "/settings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const url = new URL("/login", req.url);
      url.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.[^?]*$).*)", "/(api|trpc)(.*)"],
};
