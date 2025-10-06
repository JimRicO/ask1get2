import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Wine, Camera, Heart, User, Plus } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: Wine, label: "Cellar", path: "/cellar" },
    { icon: Camera, label: "New Wine", path: "/add", isCenter: true },
    { icon: Heart, label: "Wishlist", path: "/wishlist" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gradient-elegant">
      <main className="flex-1 pb-20">{children}</main>
      
      {/* Modern Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/50 safe-area-inset-bottom shadow-elegant">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-around gap-2">
            {navItems.map(({ icon: Icon, label, path, isCenter }) => {
              const isActive = location.pathname === path;
              
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex flex-col items-center justify-center gap-1.5 w-[60px] h-[60px] rounded-2xl transition-all duration-300 hover:scale-110 active:scale-95 bg-card shadow-elegant hover:shadow-wine border border-border/50 ${
                    isCenter
                      ? "text-card-foreground"
                      : isActive
                      ? "text-card-foreground"
                      : "text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  {isCenter ? (
                    <div className="relative text-card-foreground">
                      <Icon className="h-12 w-12" strokeWidth={2} />
                      <Plus className="h-8 w-8 absolute -top-2 -right-6" strokeWidth={2} />
                    </div>
                  ) : (
                    <Icon className={`h-10 w-10 text-card-foreground ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  )}
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
