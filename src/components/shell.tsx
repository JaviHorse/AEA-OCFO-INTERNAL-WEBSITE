"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  FileText,
  ArrowLeftRight,
  ChartNoAxesCombined,
  BookOpen,
  Settings,
  Landmark,
  LogOut,
  ChevronDown,
  Menu,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import type { Role, Year } from "@/lib/types";
import { human } from "@/lib/finance";
import { signOut } from "@/app/actions";
const items = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Departments", "/departments", Building2],
  ["Projects", "/projects", FolderKanban],
  ["Requests", "/requests", FileText],
  ["Transactions", "/transactions", ArrowLeftRight],
  ["Reports", "/reports", ChartNoAxesCombined],
  ["Finance guide", "/guide", BookOpen],
] as const;
export function Shell({
  children,
  role,
  years,
  name,
  email,
}: {
  children: React.ReactNode;
  role: Role;
  years: Year[];
  name: string;
  email: string;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected =
    years.find((y) => y.id === params.get("year")) ??
    years.find((y) => y.is_active);
  const initial = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const yearQuery =
    selected && !selected.is_active ? `?year=${selected.id}` : "";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <Landmark size={23} />
          </span>
          <span>
            AEA<span className="brand-sub">FINANCE</span>
          </span>
        </Link>
        <div className="sidebar-context">
          <span className="eyebrow">WORKSPACE</span>
          <strong>Ateneo Economics Association</strong>
          <span>
            Office of the CFO <span className="live-dot" />
          </span>
        </div>
        <nav aria-label="Main navigation">
          <span className="nav-label">OVERVIEW</span>
          {items.map(([label, url, Icon]) => (
            <Link
              key={url}
              href={`${url}${yearQuery}`}
              className={`nav-item ${path.startsWith(url) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              {label}
              {path.startsWith(url) && <span className="nav-active-dot" />}
            </Link>
          ))}
          {role === "CFO_ADMIN" && (
            <>
              <span className="nav-label admin-label">MANAGEMENT</span>
              <Link
                href="/admin"
                className={`nav-item ${path.startsWith("/admin") ? "active" : ""}`}
              >
                <Settings size={18} />
                Administration
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <BookOpen size={18} />
            <strong>A little guidance goes a long way.</strong>
            <p>Find requirements and answers in the finance guide.</p>
            <Link href="/guide">
              Open the guide <ArrowUpRight size={14} />
            </Link>
          </div>
          <span className="sidebar-footer">
            AEA FINANCE · BUILT FOR CONTINUITY
          </span>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {path.startsWith("/admin")
                ? "Administration"
                : (items.find(([, url]) => path.startsWith(url))?.[0] ??
                  "Finance")}
            </strong>
          </div>
          <div className="topbar-right">
            <label className="year-select">
              <span className="live-dot" />
              <select
                aria-label="Fiscal year"
                value={selected?.id ?? ""}
                onChange={(e) => {
                  const q = new URLSearchParams(params);
                  q.set("year", e.target.value);
                  router.push(`${path}?${q}`);
                }}
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                    {y.is_closed ? " · Closed" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <div className="profile">
              <span className="avatar">{initial}</span>
              <div>
                <strong>{name}</strong>
                <small>{human(role)}</small>
              </div>
            </div>
            <form action={signOut}>
              <button
                className="signout"
                aria-label={`Sign out ${email}`}
                title="Sign out"
              >
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </header>
        <main className="main-content">
          {selected?.is_closed && (
            <div className="alert">
              This fiscal year is archived. Its records are read-only.
            </div>
          )}
          {children}
          <footer className="content-footer">
            <span>Ateneo Economics Association</span>
            <span>Thoughtful decisions. Accountable finances.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
