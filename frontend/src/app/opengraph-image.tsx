import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BaseMind — Knowledge Driven AI Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={200}
    height={200}
  >
    <defs>
      <linearGradient
        id="og-grad"
        x1="10"
        y1="6"
        x2="52"
        y2="58"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#14B8A6" />
        <stop offset="0.55" stopColor="#0D9488" />
        <stop offset="1" stopColor="#1E4ED8" />
      </linearGradient>
    </defs>
    <path
      d="M25 9 L35 5 L45 10 L50 17 L51.5 29 L48 35 L46.5 42 L40 47 L31 47 L24 41 L21 30 L22.5 16 Z"
      fill="url(#og-grad)"
    />
    <path d="M35 5 V47" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <path d="M22.5 16 L45 23" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <path d="M21 30 L35 30" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <path d="M24 41 L46.5 42" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <path d="M17 49 L30 43 L50 47 L37 53 Z" fill="url(#og-grad)" />
    <path d="M17 49 L37 53 L37 58 L17 56 Z" fill="url(#og-grad)" opacity="0.9" />
    <path d="M37 53 L50 47 L50 52 L37 58 Z" fill="url(#og-grad)" />
    <path d="M17 49 L50 47" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <path
      d="M27 14 L35 11 L44 19 L47 30 L42 40"
      stroke="#FFFFFF"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <g fill="#FFFFFF">
      <circle cx="27" cy="14" r="1.9" />
      <circle cx="35" cy="11" r="1.9" />
      <circle cx="44" cy="19" r="1.9" />
      <circle cx="47" cy="30" r="1.9" />
      <circle cx="42" cy="40" r="1.9" />
    </g>
    <path d="M31 47 L38 53" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="31" cy="47" r="1.7" fill="#FFFFFF" />
    <circle cx="38" cy="53" r="1.7" fill="#FFFFFF" />
  </svg>
);

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF7F0",
        }}
      >
        {MARK}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#0F172A",
          }}
        >
          BaseMind
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 34,
            letterSpacing: "0.04em",
            color: "#1E4ED8",
          }}
        >
          Knowledge Driven AI Agents
        </div>
      </div>
    ),
    { ...size }
  );
}