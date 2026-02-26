import type { ReactNode } from "react";

import { LeftRail } from "@/components/layout/LeftRail";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <LeftRail />
      <div className="pl-20">{children}</div>
    </div>
  );
}
