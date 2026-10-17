import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  // Public app URL (same variable the local executor uses for preview links); falls back to the dev origin.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Relay — Build together. With everyone. Including your agents.",
  description:
    "One shared workspace where humans and Architect, Builder and Reviewer agents plan, code and verify a live project together. Change the requirements and the agents cascade the change for everyone.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  openGraph: {
    title: "Relay",
    description: "Build together. With everyone. Including your agents.",
    images: [{ url: "/og.svg", width: 1200, height: 630, type: "image/svg+xml" }],
  },
};

export default function Page() {
  return <Landing />;
}
