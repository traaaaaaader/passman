import { useState, type ReactNode } from "react";
import { Sidebar } from "../Sidebar";
import { MobileTopBar } from "./MobileTopBar";

interface AppShellProps {
  children: ReactNode;
  activeSectionId?: string;
}

export function AppShell({ children, activeSectionId }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="bg-background flex h-screen w-screen flex-col overflow-hidden md:flex-row">
      <MobileTopBar onMenuClick={() => setMobileNavOpen(true)} />
      <Sidebar
        activeSectionId={activeSectionId}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
