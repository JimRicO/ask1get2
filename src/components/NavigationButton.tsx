import { User } from "lucide-react";
import { motion } from "framer-motion";
import bottleIcon from "@/assets/nav-cellar.png.asset.json";
import pairIcon from "@/assets/nav-pair-v2.png.asset.json";
import scanIcon from "@/assets/nav-scan-v4.png.asset.json";
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
  add: { img: scanIcon.url, label: "New Wine", size: "h-[72px] w-[72px] max-w-none" },
  wishlist: { img: favIcon.url, label: "Wishlist", size: "h-[57px] w-[57px] max-w-none" },
  profile: { img: profileIcon.url, label: "Profile", size: "h-[52px] w-[52px] max-w-none" },
};

const NavigationButton = ({ preset, isActive = false, onClick }: NavigationButtonProps) => {
  const config = BUTTON_PRESETS[preset];

  return (
    <motion.button
      onClick={onClick}
      aria-label={config.label}
      aria-current={isActive ? "page" : undefined}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="relative flex flex-col items-center justify-center w-[52px] h-[52px] rounded-md bg-transparent"
    >
      {config.img ? (
        <motion.img
          src={config.img}
          alt=""
          animate={{ scale: isActive ? 1.06 : 1, opacity: isActive ? 1 : 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`${config.size} object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]`}
        />
      ) : (
        <User
          className={`${config.size} ${isActive ? "text-foreground" : "text-wine-champagne"}`}
          strokeWidth={isActive ? 2.4 : 1.8}
        />
      )}
      <span
        className={`absolute -bottom-3 whitespace-nowrap text-[9px] uppercase tracking-[0.15em] leading-none transition-colors duration-300 ${
          isActive ? "text-[#E8986A]" : "text-[#E8986A]/60"
        }`}
      >
        {config.label}
      </span>
      {isActive && (
        <motion.span
          layoutId="nav-active-indicator"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute bottom-0 left-0 right-0 h-px bg-primary"
        />
      )}
    </motion.button>
  );
};

export default NavigationButton;
