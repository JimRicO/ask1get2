import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Wine, Camera, Compass, Heart, User, Plus } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: Wine, label: "Cellar", path: "/cellar" },
    { icon: Camera, label: "Add", path: "/add", isCenter: true },
    { icon: Compass, label: "Discover", path: "/discover" },
    { icon: Heart, label: "Wishlist", path: "/wishlist" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 pb-20">{children}</main>
      
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-inset-bottom">
        <div className="max-w-lg mx-auto px-2 py-2">
          <div className="flex items-center justify-around">
            {navItems.map(({ icon: Icon, label, path, isCenter }) => {
              const isActive = location.pathname === path;
              
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 rounded-xl transition-all ${
                    isCenter
                      ? "bg-primary text-primary-foreground scale-110 shadow-wine relative"
                      : isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isCenter ? (
                    <div className="relative">
                      <Icon className="h-6 w-6" />
                      <Plus className="h-4 w-4 absolute -top-1 -right-1" strokeWidth={3} />
                    </div>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  <span className={`text-xs font-medium ${isCenter ? "hidden" : ""}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
