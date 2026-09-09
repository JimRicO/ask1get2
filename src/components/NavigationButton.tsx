import { Wine, Camera, Heart, User, Plus, UtensilsCrossed } from "lucide-react";

type ButtonPreset = "cellar" | "pair" | "add" | "wishlist" | "profile";

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
  pair: {
    icon: UtensilsCrossed,
    label: "Pair",
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
      aria-label={config.label}
      // 52px, down from 60px: five buttons plus four gaps now fits a 320px screen
      // with room to spare. At 60px the row overflowed on an SE-class phone.
      className="flex flex-col items-center justify-center gap-1.5 w-[52px] h-[52px] rounded-2xl transition-all duration-300 bg-card border border-border/50"
    >
      {isCenter ? (
        <div className="relative text-muted-foreground">
          <Icon className="h-9 w-9" strokeWidth={2} />
          {/* The Plus sits outside the icon box. With five buttons the gaps are
              tighter, so it is pulled in to stop it landing on the next button. */}
          <Plus className="h-5 w-5 absolute -top-1.5 -right-4" strokeWidth={2} />
        </div>
      ) : (
        <Icon className={`h-8 w-8 text-muted-foreground ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
      )}
    </button>
  );
};

export default NavigationButton;
