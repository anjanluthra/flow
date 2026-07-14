"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Waves,
  House,
  Scale,
  LayoutDashboard,
  ArrowLeftRight,
  CalendarRange,
  TrendingUp,
  FolderOpen,
  Settings,
  Repeat,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";

function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/auth/login" })}
      title={collapsed ? "Sign out" : undefined}
      aria-label="Sign out"
      className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-slate-600 transition-default hover:bg-slate-50 hover:text-slate-900 ${
        collapsed ? "justify-center px-0" : "px-3"
      }`}
    >
      <LogOut className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} />
      {!collapsed && "Sign out"}
    </button>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [{ href: "/home", label: "Home", icon: House }],
  },
  {
    label: "Net Worth",
    items: [{ href: "/networth", label: "Balance Sheet", icon: Scale }],
  },
  {
    label: "Cash Flow",
    items: [
      { href: "/dashboard", label: "Monthly Cash Flow", icon: LayoutDashboard },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/recurring", label: "Recurring", icon: Repeat },
      { href: "/annual", label: "Forecasting", icon: CalendarRange },
    ],
  },
  {
    label: "Investing",
    items: [{ href: "/investing", label: "Portfolio", icon: TrendingUp }],
  },
  {
    label: "Documents",
    items: [{ href: "/import", label: "Document Hub", icon: FolderOpen }],
  },
  {
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function NavList({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
      {navSections.map((section, si) => (
        <div key={si} className={si > 0 ? "mt-4" : undefined}>
          {section.label && !collapsed && (
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {section.label}
            </p>
          )}
          {section.label && collapsed && si > 0 && (
            <div className="mx-2 mb-2 mt-1 border-t border-gray-100" />
          )}
          <div className="flex flex-col gap-1">
            {section.items.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-default ${
                    collapsed ? "justify-center px-0" : "px-3"
                  } ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                    strokeWidth={isActive ? 2 : 1.75}
                  />
                  {!collapsed && label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({
  onClose,
  collapsed = false,
}: {
  onClose?: () => void;
  collapsed?: boolean;
}) {
  return (
    <div
      className={`flex h-16 items-center ${
        collapsed ? "justify-center px-0" : "justify-between px-6"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Waves className="h-6 w-6 shrink-0 text-accent" strokeWidth={2.25} />
        {!collapsed && (
          <span className="text-2xl font-bold tracking-tight text-accent">Flow</span>
        )}
      </div>
      {onClose && !collapsed && (
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-gray-200 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <Brand collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <div className="border-t border-gray-100 p-3">
          <SignOutButton collapsed={collapsed} />
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center gap-2 rounded-lg py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                Collapse
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile drawer (always full width) */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Brand onClose={onClose} />
        <NavList onNavigate={onClose} />
        <div className="border-t border-gray-100 p-3">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
