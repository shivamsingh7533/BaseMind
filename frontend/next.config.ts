import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    CLERK_SIGN_IN_URL: "/login",
    CLERK_SIGN_UP_URL: "/signup",
  },
};

export default nextConfig;
