import { User } from "lucide-react";
import bottleIcon from "@/assets/nav-bottle-full.png.asset.json";
import pairIcon from "@/assets/nav-pairings.png.asset.json";
import scanIcon from "@/assets/nav-scan-heritage.png.asset.json";
import favIcon from "@/assets/nav-favorites-decanter.png.asset.json";
import profileIcon from "@/assets/nav-profile.png.asset.json";

type ButtonPreset = "cellar" | "pair" | "add" | "wishlist" | "profile";

interface NavigationButtonProps {
  preset: ButtonPreset;
  isActive?: boolean;
  onClick?: () => void;
}

const BUTTON_PRESETS: Record<ButtonPreset, { img?: string; label: string; size: string }> = {
  cellar: { img: bottleIcon.url, label: "Cellar", size: "h-8 w-8" },
  pair: { img: pairIcon.url, label: "Pair", size: "h-8 w-8" },
  add: { img: scanIcon.url, label: "New Wine", size: "h-9 w-9" },
  wishlist: { img: favIcon.url, label: "Wishlist", size: "h-8 w-8" },
  profile: { img: profileIcon.url, label: "Profile", size: "h-7 w-7" },
};

const NavigationButton = ({ preset, isActive = false, onClick }: NavigationButtonProps) => {
  const config = BUTTON_PRESETS[preset];

  return (
    <button
      onClick={onClick}
      aria-label={config.label}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center w-[52px] h-[52px] rounded-md transition-colors duration-[320ms] ease-[var(--ease-cave)] ${
        isActive ? "bg-secondary/90" : "bg-transparent hover:bg-secondary/40"
      }`}
    >
      {config.img ? (
        <img
          src={config.img}
          alt=""
          className={`${config.size} object-contain transition-opacity duration-[320ms] ${isActive ? "opacity-100" : "opacity-80"}`}
        />
      ) : (
        <User
          className={`${config.size} ${isActive ? "text-foreground" : "text-wine-champagne"}`}
          strokeWidth={isActive ? 2.4 : 1.8}
        />
      )}
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-primary" />}
    </button>
  );
};

export default NavigationButton;
