import { LucideIcon } from "lucide-react";
import { Wine, Camera, Heart, User, Plus } from "lucide-react";

type ButtonPreset = "cellar" | "add" | "wishlist" | "profile";

interface NavigationButtonProps {
  preset: ButtonPreset;
  isActive?: boolean;
  onClick?: () => void;
}

const BUTTON_PRESETS = {
  cellar: {
    icon: Wine,
    label: "Cellar",
    isCenter: false,
  },
  add: {
    icon: Camera,
    label: "New Wine",
    isCenter: true,
  },
  wishlist: {
    icon: Heart,
    label: "Wishlist",
    isCenter: false,
  },
  profile: {
    icon: User,
    label: "Profile",
    isCenter: false,
  },
} as const;

const NavigationButton = ({ preset, isActive = false, onClick }: NavigationButtonProps) => {
  const config = BUTTON_PRESETS[preset];
  const Icon = config.icon;
  const isCenter = config.isCenter;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 w-[60px] h-[60px] rounded-2xl transition-all duration-300 hover:scale-110 active:scale-95 bg-card shadow-elegant hover:shadow-wine border border-border/50"
    >
      {isCenter ? (
        <div className="relative text-muted-foreground">
          <Icon className="h-12 w-12" strokeWidth={2} />
          <Plus className="h-8 w-8 absolute -top-2 -right-6" strokeWidth={2} />
        </div>
      ) : (
        <Icon className={`h-10 w-10 text-muted-foreground ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
      )}
    </button>
  );
};

export default NavigationButton;
