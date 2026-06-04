import { Link, useLocation } from "wouter";
import {
  Analytics01Icon,
  ChartLineData01Icon,
  Settings01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Moon01Icon,
  Sun01Icon,
} from "hugeicons-react";
import { useTheme } from "@/lib/theme-context";

const NAV_ITEMS = [
  { path: "/",         label: "Sales Dashboard",    icon: Analytics01Icon },
  { path: "/movement", label: "Movement Analytics", icon: ChartLineData01Icon },
  { path: "/settings", label: "Settings",           icon: Settings01Icon },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className={`
        flex flex-col flex-shrink-0 h-screen sidebar-transition
        bg-[var(--sidebar)] text-[var(--sidebar-foreground)]
        border-r border-[var(--sidebar-border)]
        ${collapsed ? "w-16" : "w-60"}
      `}
    >
      {/* ── Logo ── */}
      <div className={`flex items-center h-[60px] border-b border-[var(--sidebar-border)] px-4 flex-shrink-0 ${collapsed ? "justify-center" : "gap-3"}`}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--sidebar-primary)] flex items-center justify-center">
          <span className="text-[var(--sidebar-primary-foreground)] font-black text-sm leading-none">H</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-sm text-white leading-none">Hansa</p>
            <p className="text-[10px] text-white/50 leading-none mt-0.5">Analytics</p>
          </div>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <p className="px-4 mb-2 text-[10px] uppercase tracking-widest font-semibold text-white/35 select-none">
            Main
          </p>
        )}
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = location === item.path;
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  className={`
                    group flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-150 select-none relative
                    ${active
                      ? "bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)] shadow-md"
                      : "text-white/70 hover:bg-[var(--sidebar-accent)] hover:text-white"
                    }
                    ${collapsed ? "justify-center" : ""}
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    size={18}
                    className={`flex-shrink-0 ${active ? "text-[var(--sidebar-primary-foreground)]" : "text-white/60 group-hover:text-white"}`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--sidebar-primary-foreground)] opacity-70" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Bottom actions ── */}
      <div className="flex-shrink-0 border-t border-[var(--sidebar-border)] p-2 space-y-0.5">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className={`
            w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm
            text-white/70 hover:bg-[var(--sidebar-accent)] hover:text-white
            transition-all duration-150
            ${collapsed ? "justify-center" : ""}
          `}
        >
          {theme === "dark"
            ? <Sun01Icon size={18} className="flex-shrink-0 text-white/60" />
            : <Moon01Icon size={18} className="flex-shrink-0 text-white/60" />
          }
          {!collapsed && (
            <span className="text-sm font-medium">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`
            w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm
            text-white/50 hover:bg-[var(--sidebar-accent)] hover:text-white
            transition-all duration-150
            ${collapsed ? "justify-center" : ""}
          `}
        >
          {collapsed
            ? <ArrowRight01Icon size={18} className="flex-shrink-0" />
            : <ArrowLeft01Icon  size={18} className="flex-shrink-0" />
          }
          {!collapsed && <span className="text-sm font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
