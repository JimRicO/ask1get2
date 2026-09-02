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
    { preset: "add" as const, path: "/add" },
    { preset: "wishlist" as const, path: "/wishlist" },
    { preset: "profile" as const, path: "/profile" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gradient-elegant">
      <main className="flex-1 pb-20">{children}</main>
      
      {/* Modern Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/50 safe-area-inset-bottom shadow-elegant">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-around gap-2">
            {navItems.map(({ preset, path }) => {
              const isActive = location.pathname === path;
              
              return (
                <NavigationButton
                  key={path}
                  preset={preset}
                  isActive={isActive}
                  onClick={() => navigate(path)}
                />
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
