"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

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

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
      {navSections.map((section, si) => (
        <div key={si} className={si > 0 ? "mt-4" : undefined}>
          {section.label && (
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {section.label}
            </p>
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
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-default ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                    strokeWidth={isActive ? 2 : 1.75}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between px-6">
      <div className="flex items-center gap-2.5">
        <Waves className="h-6 w-6 text-accent" strokeWidth={2.25} />
        <span className="text-2xl font-bold tracking-tight text-accent">Flow</span>
      </div>
      {onClose && (
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white md:flex">
        <Brand />
        <NavList />
        <div className="border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-text-muted">Personal Finance</p>
        </div>
      </aside>

      {/* Mobile drawer */}
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
        <div className="border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-text-muted">Personal Finance</p>
        </div>
      </aside>
    </>
  );
}
