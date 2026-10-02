import { User } from "lucide-react";
import bottleIcon from "@/assets/nav-cellar.png.asset.json";
import pairIcon from "@/assets/nav-pair-v2.png.asset.json";
import scanIcon from "@/assets/nav-scan-v2.png.asset.json";
import favIcon from "@/assets/nav-wishlist-v2.png.asset.json";
import profileIcon from "@/assets/nav-profile-v2.png.asset.json";

type ButtonPreset = "cellar" | "pair" | "add" | "wishlist" | "profile";

interface NavigationButtonProps {
  preset: ButtonPreset;
  isActive?: boolean;
  onClick?: () => void;
}

const BUTTON_PRESETS: Record<ButtonPreset, { img?: string; label: string; size: string }> = {
  cellar: { img: bottleIcon.url, label: "Cellar", size: "h-[57px] w-[57px] max-w-none" },
  pair: { img: pairIcon.url, label: "Pair", size: "h-[68px] w-[68px] max-w-none" },
  add: { img: scanIcon.url, label: "New Wine", size: "h-[62px] w-[62px] max-w-none" },
  wishlist: { img: favIcon.url, label: "Wishlist", size: "h-[57px] w-[57px] max-w-none" },
  profile: { img: profileIcon.url, label: "Profile", size: "h-[52px] w-[52px] max-w-none" },
};

const NavigationButton = ({ preset, isActive = false, onClick }: NavigationButtonProps) => {
  const config = BUTTON_PRESETS[preset];

  return (
    <button
      onClick={onClick}
      aria-label={config.label}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center w-[52px] h-[52px] rounded-md transition-colors duration-[320ms] ease-[var(--ease-cave)] ${
        isActive ? "bg-transparent" : "bg-transparent hover:bg-secondary/40"
      }`}
    >
      {config.img ? (
        <img
          src={config.img}
          alt=""
          className={`${config.size} object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)] transition-opacity duration-[320ms] ${isActive ? "opacity-100" : "opacity-80"}`}
        />
      ) : (
        <User
          className={`${config.size} ${isActive ? "text-foreground" : "text-wine-champagne"}`}
          strokeWidth={isActive ? 2.4 : 1.8}
        />
      )}
      <span
        className={`absolute -bottom-3 whitespace-nowrap text-[9px] uppercase tracking-[0.15em] leading-none ${
          isActive ? "text-[#E8986A]" : "text-[#E8986A]/60"
        }`}
      >
        {config.label}
      </span>
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-primary" />}
    </button>
  );
};

export default NavigationButton;
