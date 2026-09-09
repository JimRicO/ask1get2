import { Wine, Camera, Heart, User, Plus, UtensilsCrossed } from "lucide-react";

type ButtonPreset = "cellar" | "pair" | "add" | "wishlist" | "profile";

interface NavigationButtonProps {
  preset: ButtonPreset;
  isActive?: boolean;
  onClick?: () => void;
}

/* The five shipped pictograms, unchanged. Only the tile around them is Cave. */
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
      aria-current={isActive ? "page" : undefined}
      /* 52px seated square. Five tiles plus four gaps fit a 320px screen, and
         52px clears the 44px touch floor. The active tile is a raised ground
         with a gold bottom rule; nothing scales, nothing glows. */
      className={`relative flex flex-col items-center justify-center w-[52px] h-[52px] rounded-md transition-colors duration-[320ms] ease-[var(--ease-cave)] ${
        isActive ? "bg-secondary/90" : "bg-transparent hover:bg-secondary/40"
      }`}
    >
      {isCenter ? (
        <div className={`relative ${isActive ? "text-foreground" : "text-wine-champagne"}`}>
          <Icon className="h-7 w-7" strokeWidth={isActive ? 2.4 : 1.8} />
          {/* The Plus sits outside the icon box. With five tiles the gaps are
              tight, so it is pulled in to stop it landing on the next one. */}
          <Plus
            className="h-4 w-4 absolute -top-1 -right-3"
            strokeWidth={isActive ? 2.4 : 1.8}
          />
        </div>
      ) : (
        <Icon
          className={`h-6 w-6 ${isActive ? "text-foreground" : "text-wine-champagne"}`}
          strokeWidth={isActive ? 2.4 : 1.8}
        />
      )}
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-primary" />}
    </button>
  );
};

export default NavigationButton;
