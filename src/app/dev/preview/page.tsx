import { notFound } from "next/navigation";
import { DevPreview } from "./DevPreview";

export const dynamic = "force-dynamic";

export const metadata = { title: "Relay · dev preview" };

export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevPreview />;
}
