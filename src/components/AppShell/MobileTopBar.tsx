import { Menu, Shield } from "lucide-react";

interface MobileTopBarProps {
  onMenuClick: () => void;
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  return (
    <header className="border-border bg-card flex flex-shrink-0 items-center gap-2 border-b px-4 py-3 md:hidden">
      <button
        onClick={onMenuClick}
        aria-label="Открыть меню"
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
      >
        <Menu size={20} />
      </button>
      <Shield className="text-primary" size={18} />
      <span className="text-foreground text-sm font-semibold">Passman</span>
    </header>
  );
}
