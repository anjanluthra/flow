"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Waves,
  House,
  LayoutDashboard,
  ArrowLeftRight,
  Upload,
  PiggyBank,
  CalendarRange,
  TrendingUp,
  FileText,
  Settings,
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

const navSections: NavSection[] = [
  {
    items: [
      { href: "/home", label: "Home", icon: House },
      { href: "/networth", label: "Net Worth", icon: PiggyBank },
    ],
  },
  {
    label: "Cash Flow",
    items: [
      { href: "/dashboard", label: "Summary", icon: LayoutDashboard },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/import", label: "Import", icon: Upload },
      { href: "/annual", label: "Annual & Forecast", icon: CalendarRange },
    ],
  },
  {
    items: [
      { href: "/investing", label: "Investing", icon: TrendingUp },
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-gray-200 bg-white">
      {/* Branding */}
      <div className="flex h-16 items-center gap-2.5 px-6">
        <Waves className="h-6 w-6 text-accent" strokeWidth={2.25} />
        <span className="text-2xl font-bold tracking-tight text-accent">
          Flow
        </span>
      </div>

      {/* Navigation */}
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

      {/* Footer */}
      <div className="border-t border-gray-100 px-6 py-4">
        <p className="text-xs text-text-muted">Personal Finance</p>
      </div>
    </aside>
  );
}
