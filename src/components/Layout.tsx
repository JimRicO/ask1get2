import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, Heart, User, Plus } from "lucide-react";
import addButtonTexture from "@/assets/add-button-texture.png";
import threeBottlesIcon from "@/assets/three-bottles.png";

const ThreeBottles = ({ className }: { className?: string }) => (
  <img src={threeBottlesIcon} alt="Cellar" className={`w-6 h-6 ${className}`} />
);

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: ThreeBottles, label: "Cellar", path: "/cellar" },
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
                  style={{
                    backgroundImage: `url(${addButtonTexture})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 w-[60px] h-[60px] rounded-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${
                    isCenter
                      ? "text-white/80 shadow-wine hover:shadow-glow"
                      : isActive
                      ? "text-white/80 shadow-md"
                      : "text-white/50 hover:text-white/70 hover:shadow-md"
                  }`}
                >
                  {isCenter ? (
                    <div className="relative text-white/60">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                      <Plus className="h-4 w-4 absolute -top-1 -right-3" strokeWidth={2} />
                    </div>
                  ) : (
                    <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  )}
                  <span className={`text-[9px] font-semibold tracking-wide ${isCenter ? 'text-white/60' : ''}`}>
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
