import { ReactNode } from "react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import NavigationButton from "./NavigationButton";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

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

      <main className="relative flex-1 pb-28">{children}</main>

      {/* Centred and inset rather than edge to edge: the bar is a seated panel
          on the canvas, not a strip welded to the bottom of the glass. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 px-7 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[1180px] rounded-t-md border border-b-0 border-border bg-[rgba(43,22,22,0.94)] backdrop-blur-[10px]">
          <div className="flex items-center justify-around gap-1.5 px-4 py-2">
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
