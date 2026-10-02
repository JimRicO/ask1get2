import { ReactNode, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import NavigationButton from "./NavigationButton";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const touchRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const navItems = [
    { preset: "cellar" as const, path: "/cellar" },
    { preset: "pair" as const, path: "/pair" },
    { preset: "add" as const, path: "/add" },
    { preset: "wishlist" as const, path: "/wishlist" },
    { preset: "profile" as const, path: "/profile" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Ambient cave light: two blurred pools drifting behind everything, the
          one piece of motion that runs unprompted. Purely decorative, so it is
          inert to pointers and hidden from assistive tech. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="cave-glow cave-glow-a" />
        <div className="cave-glow cave-glow-b" />
      </div>

      <main
        className="relative flex-1 pb-32"
        onTouchStart={(e) => {
          const t = e.touches[0];
          const el = e.target as HTMLElement;
          // Skip swipes that start in fields, sliders or sideways-scrolling areas.
          let blocked = !!el.closest("input, textarea, select, [role=slider], [data-no-swipe]");
          for (let n: HTMLElement | null = el; n && !blocked; n = n.parentElement) {
            if (n.scrollWidth > n.clientWidth && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) blocked = true;
          }
          touchRef.current = blocked ? null : { x: t.clientX, y: t.clientY, time: Date.now() };
        }}
        onTouchEnd={(e) => {
          const start = touchRef.current;
          touchRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - start.time > 600) return;
          const idx = navItems.findIndex((n) => n.path === location.pathname);
          if (idx === -1) return;
          const next = navItems[idx + (dx < 0 ? 1 : -1)];
          if (next) navigate(next.path);
        }}
      >
        {children}
      </main>

      {/* Centred and inset rather than edge to edge: the bar is a seated panel
          on the canvas, not a strip welded to the bottom of the glass. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[1180px] rounded-t-md wood-rail">
          <div className="flex h-[88px] items-start justify-around gap-1.5 px-2 pt-[10px]">
            {navItems.map(({ preset, path }) => (
              <NavigationButton
                key={path}
                preset={preset}
                isActive={location.pathname === path}
                onClick={() => navigate(path)}
              />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
