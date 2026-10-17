import type { ReactNode } from "react";

/** Full-viewport app shell: the workspace owns the scroll inside its panels. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh w-full overflow-hidden bg-bg-0">{children}</div>;
}
