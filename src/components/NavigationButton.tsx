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

const BUTTON_PRESETS: Record<ButtonPreset, { img: string; label: string; maxW: string }> = {
  cellar: { img: bottleIcon.url, label: "Cellar", maxW: "max-w-[52px]" },
  pair: { img: pairIcon.url, label: "Pair", maxW: "max-w-[52px]" },
  add: { img: scanIcon.url, label: "New Wine", maxW: "max-w-[50px]" },
  wishlist: { img: favIcon.url, label: "Wishlist", maxW: "max-w-[52px]" },
  profile: { img: profileIcon.url, label: "Profile", maxW: "max-w-[42px]" },
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
      className="relative flex min-w-[56px] flex-col items-center bg-transparent"
    >
      <div className="flex h-[46px] w-[52px] items-center justify-center">
        <motion.img
          src={config.img}
          alt=""
          animate={{ scale: isActive ? 1.06 : 1, opacity: isActive ? 1 : 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`h-[46px] w-auto ${config.maxW} object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]`}
        />
      </div>
      <span
        className={`mt-[7px] whitespace-nowrap font-['Fira_Sans'] text-[8.5px] font-medium uppercase leading-none tracking-[0.14em] text-[#E8986A] transition-opacity duration-300 ${
          isActive ? "opacity-100" : "opacity-55"
        }`}
      >
        {config.label}
      </span>
      <span className="mt-[6px] block h-[1.5px] w-[34px]">
        {isActive && (
          <motion.span
            layoutId="nav-active-indicator"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="block h-[1.5px] w-[34px] bg-[#C98A5E] shadow-[0_0_6px_rgba(232,152,106,0.45)]"
          />
        )}
      </span>
    </motion.button>
  );
};

export default NavigationButton;
