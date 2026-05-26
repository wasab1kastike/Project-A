"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HomePageState } from "@/lib/game/read-model";

type CommandDockProps = {
  state: HomePageState;
  tickHealth: "ok" | "lagging" | "stalled" | null;
  tickDelayMinutes: number | null;
};

type BadgeCount = {
  count: number;
  severity: "info" | "warning" | "danger";
};

function getBadge(text: string, severity: "info" | "warning" | "danger") {
  return (
    <span
      style={{
        background:
          severity === "danger"
            ? "var(--color-danger, #e03)"
            : severity === "warning"
              ? "var(--color-warning, #f90)"
              : "var(--color-info, #48f)",
        color: "#fff",
        fontSize: "0.65rem",
        fontWeight: 700,
        padding: "1px 5px",
        borderRadius: "8px",
        lineHeight: "1.4",
        marginLeft: "4px",
      }}
    >
      {text}
    </span>
  );
}

function getTickBadge(
  health: "ok" | "lagging" | "stalled" | null
): { text: string; severity: "info" | "warning" | "danger" } | null {
  if (!health || health === "ok") return null;
  return {
    text: health === "stalled" ? "STALLED" : `${health}`,
    severity: health === "stalled" ? "danger" : "warning",
  };
}

const DOCK_LINKS = [
  { href: "/", label: "Map", icon: "🗺" },
  { href: "/castle", label: "Castle", icon: "🏰" },
  { href: "/politics", label: "Politics", icon: "⚖" },
  { href: "/history", label: "Reports", icon: "📋" },
] as const;

export default function CommandDock({ state, tickHealth }: CommandDockProps) {
  const pathname = usePathname();
  const tickBadge = getTickBadge(tickHealth);
  const incomingOffersCount = state.incomingOfferCount ?? 0;
  const incidentCount = state.incidentCount ?? 0;

  const dockContent = (
    <>
      {DOCK_LINKS.map((link) => {
        const isActive = pathname === link.href;
        const badge =
          link.href === "/politics" && incomingOffersCount > 0
            ? getBadge(String(incomingOffersCount), "info")
            : link.href === "/" && incidentCount > 0
              ? getBadge(String(incidentCount), "warning")
              : link.href === "/" && tickBadge
                ? getBadge(tickBadge.text, tickBadge.severity)
                : null;

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              color: isActive
                ? "var(--color-accent, #48f)"
                : "var(--color-text-dim, #888)",
              fontWeight: isActive ? 600 : 400,
              fontSize: "0.85rem",
              background: isActive
                ? "var(--color-surface-hover, rgba(255,255,255,0.06))"
                : "transparent",
            }}
          >
            <span style={{ fontSize: "1rem" }}>{link.icon}</span>
            <span>{link.label}</span>
            {badge}
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      {/* Desktop dock */}
      <nav
        aria-label="Command dock"
        style={{
          position: "fixed",
          top: "8px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: "4px",
          padding: "4px 6px",
          borderRadius: "10px",
          background: "var(--color-surface, rgba(20,20,30,0.92))",
          border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {dockContent}
      </nav>

      {/* Mobile dock */}
      <nav
        aria-label="Command dock mobile"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "space-around",
          padding: "6px env(safe-area-inset-bottom, 6px)",
          background: "var(--color-surface, rgba(20,20,30,0.95))",
          borderTop: "1px solid var(--color-border, rgba(255,255,255,0.08))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        className="mobile-command-dock"
      >
        {DOCK_LINKS.map((link) => {
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1px",
                padding: "4px 8px",
                textDecoration: "none",
                color: isActive
                  ? "var(--color-accent, #48f)"
                  : "var(--color-text-dim, #888)",
                fontSize: "0.65rem",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
