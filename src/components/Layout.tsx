import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "@/lib/router-compat";
import NavigationButton from "./NavigationButton";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

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

      <motion.main
        key={location.pathname}
        initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex-1 pb-32"
      >
        {children}
      </motion.main>

      {/* Centred and inset rather than edge to edge: the bar is a seated panel
          on the canvas, not a strip welded to the bottom of the glass. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[1180px] rounded-t-md wood-rail">
          <div className="flex items-center justify-around gap-1.5 px-2 pt-2 pb-5">
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
