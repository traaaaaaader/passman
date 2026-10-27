import { Shield, X } from "lucide-react";
import { SectionNavList } from "./SectionNavList";
import { SidebarFooter } from "./SidebarFooter";

interface SidebarProps {
  activeSectionId?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ activeSectionId, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Закрыть меню"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}
      <aside
        className={`border-border bg-card fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:flex-shrink-0 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <Shield className="text-primary" size={22} />
            <span className="text-foreground text-base font-semibold">Passman</span>
          </div>
          <button
            onClick={onMobileClose}
            aria-label="Закрыть меню"
            className="text-muted-foreground hover:bg-muted rounded p-1 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <SectionNavList activeSectionId={activeSectionId} onNavigate={onMobileClose} />
        <SidebarFooter onNavigate={onMobileClose} />
      </aside>
    </>
  );
}
