"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  FileText,
  ChartNoAxesCombined,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  CheckCheck,
} from "lucide-react";
import { AeaLogo, MascotPair } from "./aea-brand";
import { useState } from "react";
import type { Role, Year } from "@/lib/types";
import { isAdmin } from "@/lib/permissions";
import { navigationFor } from "@/lib/ux";
import { signOut } from "@/app/actions";
const items = [
  ["Dashboard", "/dashboard", LayoutDashboard, ""],
  ["Finance Requests", "/requests", FileText, "REQUESTS"],
  ["Approvals", "/approvals", CheckCheck, "REQUESTS"],
  ["Reports", "/reports", ChartNoAxesCombined, "FINANCE"],
  ["Departments", "/departments", Building2, "ORGANIZATION"],
  ["Projects", "/projects", FolderKanban, "ORGANIZATION"],
  ["Help & Requirements", "/guide", BookOpen, "SUPPORT"],
  ["Administration", "/admin", Settings, "SYSTEM"],
] as const;
export function Shell({
  children,
  role,
  years,
  name,
  email,
  department,
}: {
  children: React.ReactNode;
  role: Role;
  years: Year[];
  name: string;
  email: string;
  department: string;
}) {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const admin = isAdmin(role);
  const selected =
    years.find((y) => y.id === params.get("year")) ??
    years.find((y) => y.is_active);
  const yearQuery =
    selected && !selected.is_active ? `?year=${selected.id}` : "";
  const links = items.filter(([, url]) => navigationFor(role).includes(url));
  return (
    <div className="app-shell">
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside id="main-navigation" className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <AeaLogo />
          <span className="brand-sub">FINANCE PORTAL</span>
        </Link>
        <nav aria-label="Main navigation">
          {links.map(([label, url, Icon, group], index) => (
            <div key={url}>
              {admin && group && group !== links[index - 1]?.[3] && (
                <span className="nav-label">{group}</span>
              )}
              <Link
                href={`${url}${yearQuery}`}
                className={`nav-item ${path.startsWith(url) ? "active" : ""}`}
                aria-current={path.startsWith(url) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {!admin && url === "/requests" ? "Requests" : label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom portal-identity">
          <Link href="/profile" className="nav-item">
            <span className="avatar">
              {name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{name}</strong>
              <small>
                {admin ? "Finance Administrator" : `${department} Member`}
              </small>
            </span>
          </Link>
          <form action={signOut}>
            <button className="nav-item" aria-label={`Sign out ${email}`}>
              <LogOut size={17} />
              Sign Out
            </button>
          </form>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Toggle navigation"
              aria-expanded={open}
              aria-controls="main-navigation"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <AeaLogo className="mobile-brand-logo" />
            <span className="workspace-label">
              {admin ? "FINANCE WORKSPACE" : "MEMBER WORKSPACE"}
            </span>
          </div>
          <label className="year-select">
            <span>Academic year</span>
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
          </label>
        </header>
        <main id="workspace-content" className="main-content" tabIndex={-1}>
          {selected?.is_closed && (
            <div className="alert">
              This fiscal year is archived. Its records are read-only.
            </div>
          )}
          {children}
          <footer className="content-footer">
            <span>Ateneo Economics Association</span>
            <MascotPair className="footer-mascots" />
          </footer>
        </main>
      </div>
    </div>
  );
}
