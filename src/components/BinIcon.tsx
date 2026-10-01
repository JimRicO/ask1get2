import binIcon from "@/assets/bin-icon.png.asset.json";

export const BinIcon = ({ className = "" }: { className?: string }) => (
  <img src={binIcon.url} alt="" aria-hidden="true" className={`inline-block object-contain scale-150 ${className}`} />
);
