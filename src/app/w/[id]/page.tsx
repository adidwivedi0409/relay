import type { Metadata } from "next";
import { WorkspaceApp } from "@/components/workspace/WorkspaceApp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Relay · workspace ${id.slice(0, 8)}` };
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspaceApp id={id} />;
}
