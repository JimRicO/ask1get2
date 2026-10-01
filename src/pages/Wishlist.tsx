import { BinIcon } from "@/components/BinIcon";
import addBottleButton from "@/assets/add-bottle-button-v2.png.asset.json";
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractWineData, describeWine } from "@/lib/wine-ai.functions";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrapeList } from "@/lib/normalizeGrape";
import { normalizeImageOrientation } from "@/lib/normalizeImageOrientation";


import Layout from "@/components/Layout";
import { Heart, Camera, Loader2, Edit, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ScanLine, LockCorners, Flash } from "@/components/ScanEffects";
import { Session } from "@supabase/supabase-js";
import uploadButtonImg from "@/assets/upload-button.png";
import bottleIcon from "@/assets/bottle-icon.png";
import neckIconAsset from "@/assets/bottle-neck-label.png.asset.json";
import frontIconAsset from "@/assets/bottle-front-label.png.asset.json";
import fullIconAsset from "@/assets/full_bottle.png.asset.json";
import backIconAsset from "@/assets/bottle-back-label.png.asset.json";
import scanIconAsset from "@/assets/nav-scan-heritage.png.asset.json";
const neckButtonImg = neckIconAsset.url;
const frontLabelButtonImg = frontIconAsset.url;
const fullBottleButtonImg = fullIconAsset.url;
const backLabelButtonImg = backIconAsset.url;

interface WishlistItem {
  id: string;
  wine_name: string;
  producer: string | null;
  vintage_year: number | null;
  wine_type: string | null;
  region: string | null;
  country: string | null;
  grape_varietals: string | null;
  images: any;
  description: string | null;
  notes: string | null;
  created_at: string;
}

const Wishlist = () => {
  const navigate = useNavigate();
  const extractWineDataFn = useServerFn(extractWineData);
  const describeWineFn = useServerFn(describeWine);
  const [session, setSession] = useState<Session | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [magicScanCompleted, setMagicScanCompleted] = useState(false);
  // Same scan effects as Add Wine: flash + sweep on upload, sweep while reading, corners lock after.
  const [shotFire, setShotFire] = useState<Record<string, number>>({});
  const [shotScanning, setShotScanning] = useState<Record<string, boolean>>({});
  const [lockKey, setLockKey] = useState(0);
  // Bumped per photo; reading starts automatically once the new photo is in state.
  const [autoScanKey, setAutoScanKey] = useState(0);
  const formSectionRef = useRef<HTMLDivElement>(null);
  
  const [images, setImages] = useState<{
    front: File | null;
    back: File | null;
    neck: File | null;
    overall: File | null;
  }>({
    front: null,
    back: null,
    neck: null,
    overall: null
  });

  const [imagePreviews, setImagePreviews] = useState<{
    front: string | null;
    back: string | null;
    neck: string | null;
    overall: string | null;
  }>({
    front: null,
    back: null,
    neck: null,
    overall: null
  });

  const [descriptionSources, setDescriptionSources] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    wine_name: "",
    producer: "",
    vintage_year: "",
    wine_type: "",
    country: "",
    region: "",
    grape_varietals: "",
    description: "",
    notes: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session) {
      fetchWishlist();
    }
  }, [session]);

  const fetchWishlist = async () => {
    try {
      const { data, error } = await supabase
        .from("wishlist")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWishlistItems(data || []);
    } catch (error: any) {
      toast.error("Failed to load wishlist");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = async (type: 'front' | 'back' | 'neck' | 'overall', rawFile: File | null) => {
    if (rawFile) {
      const file = await normalizeImageOrientation(rawFile);
      setImages(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [type]: reader.result as string }));
        setShotFire(prev => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }));
        setShotScanning(prev => ({ ...prev, [type]: true }));
        window.setTimeout(() => setShotScanning(prev => ({ ...prev, [type]: false })), 2400);
      };
      reader.readAsDataURL(file);
      setAutoScanKey(k => k + 1);
    } else {
      setImages(prev => ({ ...prev, [type]: null }));
      setImagePreviews(prev => ({ ...prev, [type]: null }));
    }
  };


  const processImageWithAI = async () => {
    if (!Object.values(images).some(img => img !== null)) return;

    setAiProcessing(true);
    try {
      const imageData = await Promise.all(
        Object.entries(images)
          .filter(([_, file]) => file !== null)
          .map(async ([type, file]) => {
            const reader = new FileReader();
            return new Promise<{ type: string; data: string }>((resolve) => {
              reader.onloadend = () => resolve({ type, data: reader.result as string });
              reader.readAsDataURL(file!);
            });
          })
      );

      const aiData = (await extractWineDataFn({
        data: { images: imageData }
      })) as { extracted: Record<string, any> };

      const wineData = aiData?.extracted || {};
      
      setFormData({
        wine_name: wineData.wine_name || "",
        producer: wineData.producer || "",
        vintage_year: wineData.vintage_year?.toString() || "",
        wine_type: wineData.wine_type || "",
        country: wineData.country || "",
        region: wineData.region || "",
        grape_varietals: Array.isArray(wineData.grape_varietals) 
          ? wineData.grape_varietals.join(", ")
          : wineData.grape_varietals || "",
        description: wineData.description || "",
        notes: ""
      });

      setMagicScanCompleted(true);

      // Look the wine up on the web and write a grounded description
      if (wineData.wine_name) {
        try {
          const described = (await describeWineFn({
            data: {
              wine_name: String(wineData.wine_name),
              producer: wineData.producer ?? null,
              vintage_year: wineData.vintage_year ?? null,
              region: wineData.region ?? null,
              country: wineData.country ?? null,
              grape_varietals: Array.isArray(wineData.grape_varietals)
                ? wineData.grape_varietals.join(", ")
                : wineData.grape_varietals ?? null
            }
          })) as { description: string; sources?: string[] };
          if (Array.isArray(described?.sources)) {
            setDescriptionSources(described.sources);
          }
          if (described?.description) {
            setFormData(prev => ({ ...prev, description: described.description }));
          }
        } catch (err) {
          console.error("Description lookup failed:", err);
        }
      }
      
      // Scroll to form section
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error: any) {
      console.error(error);
    } finally {
      setAiProcessing(false);
      window.setTimeout(() => setLockKey(k => k + 1), 280);
    }
  };

  useEffect(() => {
    if (autoScanKey === 0) return;
    const t = window.setTimeout(() => { void processImageWithAI(); }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScanKey]);

  const handleSubmit = async () => {
    if (!session) return;
    if (!formData.wine_name) {
      toast.error("Wine name is required");
      return;
    }

    setLoading(true);
    try {
      const imageUrls: any = {};

      // Upload all images
      for (const [type, file] of Object.entries(images)) {
        if (file) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${session.user.id}/wishlist_${type}_${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from("wine-images")
            .upload(fileName, file);
          
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from("wine-images")
            .getPublicUrl(fileName);
          
          imageUrls[type] = publicUrl;
        }
      }

      const wishlistData = {
        user_id: session.user.id,
        wine_name: formData.wine_name,
        producer: formData.producer || null,
        vintage_year: formData.vintage_year ? parseInt(formData.vintage_year) : null,
        wine_type: formData.wine_type || null,
        country: normalizeCountry(formData.country),
        region: formData.region || null,
        grape_varietals: normalizeGrapeList(formData.grape_varietals.split(',')).join(', ') || null,
        images: Object.keys(imageUrls).length > 0 ? imageUrls : null,
        description: formData.description || null,
        description_sources: descriptionSources.length > 0 ? descriptionSources : null,
        notes: formData.notes || null
      };

      const { error: insertError } = await supabase
        .from("wishlist")
        .insert(wishlistData);

      if (insertError) throw insertError;

      toast.success(`Added "${formData.wine_name}" to wishlist!`);
      
      // Reset form
      setFormData({
        wine_name: "",
        producer: "",
        vintage_year: "",
        wine_type: "",
        country: "",
        region: "",
        grape_varietals: "",
        description: "",
        notes: ""
      });
      setImages({ front: null, back: null, neck: null, overall: null });
      setImagePreviews({ front: null, back: null, neck: null, overall: null });
      setMagicScanCompleted(false);
      setAddDialogOpen(false);
      
      fetchWishlist();
    } catch (error: any) {
      toast.error(error.message || "Failed to add to wishlist");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: string, wineName: string) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const { error } = await supabase
        .from("wishlist")
        .delete()
        .eq("id", itemToDelete);

      if (error) throw error;
      toast.success("Removed from wishlist");
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchWishlist();
    } catch (error: any) {
      toast.error("Failed to delete item");
      console.error(error);
    }
  };

  const openAddDialog = () => {
    setFormData({
      wine_name: "",
      producer: "",
      vintage_year: "",
      wine_type: "",
      country: "",
      region: "",
      grape_varietals: "",
      description: "",
      notes: ""
    });
    setImages({ front: null, back: null, neck: null, overall: null });
    setImagePreviews({ front: null, back: null, neck: null, overall: null });
    setMagicScanCompleted(false);
    setAddDialogOpen(true);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1180px] bg-background text-primary-foreground px-4 pt-8 pb-6">
          <div className="mb-2 flex items-center gap-3">
            <h1 className="font-serif font-bold leading-[1.02] tracking-[-0.02em] text-foreground text-[clamp(38px,5.6vw,62px)]">Wishlist</h1>
            <button type="button" onClick={openAddDialog} aria-label="Add a Bottle" className="shrink-0 transition-transform duration-150 hover:brightness-110 active:scale-95">
              <img src={addBottleButton.url} alt="" className="h-12 w-12 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.8)]" />
            </button>
          </div>
          <p className="mt-3 text-[15px] text-wine-champagne">Wines you want to try, to remember, to buy.</p>
        </div>

        <div className="mx-auto max-w-[1180px] mt-2 pb-20">
          {/* Wishlist Items */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            </div>
          ) : wishlistItems.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-foreground">No wines yet</h3>
              <p className="text-muted-foreground">
                Take a photo of a wine label to add it to your wishlist
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-4">
              {wishlistItems.map((item) => (
                <div
                  key={item.id}
                  className="wood-panel relative flex cursor-pointer items-start gap-5 rounded-lg px-4 py-4 transition-transform duration-150 active:translate-y-px"
                  onClick={() => {
                    setSelectedItem(item);
                    setDetailDialogOpen(true);
                  }}
                >
                  {/* The thumbnail's job is a glimpse of the bottle, so where
                      there is no photo the label is printed from the row's own
                      data on the parchment ground rather than showing a Heart.
                      The Heart in the nav bar stays; that is the tab glyph. */}
                  <div className="aspect-3/4 w-[clamp(76px,15vw,108px)] shrink-0 overflow-hidden border border-border bg-parchment rounded-md">
                    {item.images?.overall ? (
                      <img
                        src={item.images.overall}
                        alt=""
                        className="h-full w-full object-cover rounded-md"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                        {(item.region || item.country) && (
                          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--label-ink-dim)]">
                            {[item.region, item.country].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {item.producer && (
                          <span className="font-serif font-semibold leading-tight text-[color:var(--label-ink)] text-[clamp(9px,1.8vw,12px)]">
                            {item.producer}
                          </span>
                        )}
                        <span className="my-0.5 h-px w-[56%] bg-[color:var(--label-rule)]" />
                        {item.vintage_year && (
                          <span className="font-mono text-[9px] tracking-[0.06em] text-[color:var(--label-ink-dim)]">
                            {item.vintage_year}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Wine details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="mb-1 pr-9 font-serif text-[21px] leading-tight tracking-[-0.005em] text-foreground">
                      {item.wine_name}
                    </h3>
                    {item.producer && (
                      <p className="text-sm text-foreground/80 mb-1">{item.producer}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-wine-champagne mb-2">
                      {item.vintage_year && <span>{item.vintage_year}</span>}
                      {item.wine_type && (
                        <span className="capitalize">{item.wine_type}</span>
                      )}
                      {item.region && <span>{item.region}</span>}
                      {item.country && <span>{item.country}</span>}
                    </div>
                    {item.grape_varietals && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {item.grape_varietals}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="absolute right-2 top-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(item.id, item.wine_name);
                      }}
                    >
                      <BinIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Wine Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Wine to Wishlist</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Image Upload Section */}
            <div className="space-y-4">
              <Label className="text-foreground">Upload Wine Photos</Label>
              <div className="grid grid-cols-2 gap-4">
                {/* Front Label */}
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange('front', e.target.files?.[0] || null)}
                    className="hidden"
                    id="upload-front"
                  />
                  <label
                    htmlFor="upload-front"
                    className="block cursor-pointer"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-dashed border-border transition-colors duration-[320ms] hover:border-wine-champagne">
                      {shotFire.front ? <Flash fire={shotFire.front} /> : null}
                      <ScanLine active={(aiProcessing && !!images.front) || !!shotScanning.front} from={4} to={92} ms={2400} />
                      {lockKey > 0 && images.front && <LockCorners lock={lockKey} gap={8} />}
                      {imagePreviews.front ? (
                         <img src={imagePreviews.front} alt="Front" className="w-full h-full object-contain rounded-md" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><img src={frontLabelButtonImg} alt="" className="h-[78%] w-auto object-contain" /></div>
                      )}
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">Front Label</span>
                  </label>
                  {images.front && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImageChange('front', null)}
                      className="w-full text-red-400"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>

                {/* Back Label */}
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange('back', e.target.files?.[0] || null)}
                    className="hidden"
                    id="upload-back"
                  />
                  <label htmlFor="upload-back" className="block cursor-pointer">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-dashed border-border transition-colors duration-[320ms] hover:border-wine-champagne">
                      {shotFire.back ? <Flash fire={shotFire.back} /> : null}
                      <ScanLine active={(aiProcessing && !!images.back) || !!shotScanning.back} from={4} to={92} ms={2400} />
                      {lockKey > 0 && images.back && <LockCorners lock={lockKey} gap={8} />}
                      {imagePreviews.back ? (
                         <img src={imagePreviews.back} alt="Back" className="w-full h-full object-contain rounded-md" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><img src={backLabelButtonImg} alt="" className="h-[78%] w-auto object-contain" /></div>
                      )}
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">Back Label</span>
                  </label>
                  {images.back && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImageChange('back', null)}
                      className="w-full text-red-400"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>

                {/* Neck Label */}
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange('neck', e.target.files?.[0] || null)}
                    className="hidden"
                    id="upload-neck"
                  />
                  <label htmlFor="upload-neck" className="block cursor-pointer">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-dashed border-border transition-colors duration-[320ms] hover:border-wine-champagne">
                      {shotFire.neck ? <Flash fire={shotFire.neck} /> : null}
                      <ScanLine active={(aiProcessing && !!images.neck) || !!shotScanning.neck} from={4} to={92} ms={2400} />
                      {lockKey > 0 && images.neck && <LockCorners lock={lockKey} gap={8} />}
                      {imagePreviews.neck ? (
                         <img src={imagePreviews.neck} alt="Neck" className="w-full h-full object-contain rounded-md" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><img src={neckButtonImg} alt="" className="h-[78%] w-auto object-contain" /></div>
                      )}
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">Neck</span>
                  </label>
                  {images.neck && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImageChange('neck', null)}
                      className="w-full text-red-400"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>

                {/* Full Bottle */}
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange('overall', e.target.files?.[0] || null)}
                    className="hidden"
                    id="upload-overall"
                  />
                  <label htmlFor="upload-overall" className="block cursor-pointer">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-dashed border-border transition-colors duration-[320ms] hover:border-wine-champagne">
                      {shotFire.overall ? <Flash fire={shotFire.overall} /> : null}
                      <ScanLine active={(aiProcessing && !!images.overall) || !!shotScanning.overall} from={4} to={92} ms={2400} />
                      {lockKey > 0 && images.overall && <LockCorners lock={lockKey} gap={8} />}
                      {imagePreviews.overall ? (
                         <img src={imagePreviews.overall} alt="Full Bottle" className="w-full h-full object-contain rounded-md" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><img src={fullBottleButtonImg} alt="" className="h-[78%] w-auto object-contain" /></div>
                      )}
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">Full Bottle</span>
                  </label>
                  {images.overall && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImageChange('overall', null)}
                      className="w-full text-red-400"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              {/* Reading starts on its own after each photo; the scan line on the tiles shows progress. */}
            </div>

            {/* Form Fields - Show after Magic Scan */}
            {magicScanCompleted && (
              <div ref={formSectionRef} className="space-y-4 scroll-mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Wine Name *</Label>
                  <Input
                    value={formData.wine_name}
                    onChange={(e) => setFormData({ ...formData, wine_name: e.target.value })}
                    className="bg-card border-border text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Producer</Label>
                    <Input
                      value={formData.producer}
                      onChange={(e) => setFormData({ ...formData, producer: e.target.value })}
                      className="bg-card border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">Vintage Year</Label>
                    <Input
                      type="number"
                      value={formData.vintage_year}
                      onChange={(e) => setFormData({ ...formData, vintage_year: e.target.value })}
                      className="bg-card border-border text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Wine Type</Label>
                  <Select value={formData.wine_type} onValueChange={(value) => setFormData({ ...formData, wine_type: value })}>
                    <SelectTrigger className="bg-card border-border text-foreground">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="white">White</SelectItem>
                      <SelectItem value="rose">Rosé</SelectItem>
                      <SelectItem value="sparkling">Sparkling</SelectItem>
                      <SelectItem value="dessert">Dessert</SelectItem>
                      <SelectItem value="fortified">Fortified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="bg-card border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">Region</Label>
                    <Input
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="bg-card border-border text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Grape Varietals</Label>
                  <Input
                    value={formData.grape_varietals}
                    onChange={(e) => setFormData({ ...formData, grape_varietals: e.target.value })}
                    placeholder="e.g., Cabernet Sauvignon, Merlot"
                    className="bg-card border-border text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-card border-border text-foreground min-h-[100px]"
                    placeholder="Wine description from the label..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Why you want it</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="bg-card border-border text-foreground min-h-[100px]"
                    placeholder="Why do you want this wine? Where did you hear about it?"
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={loading || !formData.wine_name}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Adding to Wishlist...
                    </>
                  ) : (
                    "Add to Wishlist"
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wine Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-2xl">{selectedItem?.wine_name}</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              {/* Images Gallery */}
              {selectedItem.images && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.images.front && (
                    <div className="space-y-2">
                      <Label className="text-wine-champagne text-xs">Front Label</Label>
                      <img
                        src={selectedItem.images.front}
                        alt="Front label"
                        className="w-full rounded-lg border border-border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.back && (
                    <div className="space-y-2">
                      <Label className="text-wine-champagne text-xs">Back Label</Label>
                      <img
                        src={selectedItem.images.back}
                        alt="Back label"
                        className="w-full rounded-lg border border-border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.neck && (
                    <div className="space-y-2">
                      <Label className="text-wine-champagne text-xs">Neck</Label>
                      <img
                        src={selectedItem.images.neck}
                        alt="Neck"
                        className="w-full rounded-lg border border-border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.overall && (
                    <div className="space-y-2">
                      <Label className="text-wine-champagne text-xs">Full Bottle</Label>
                      <img
                        src={selectedItem.images.overall}
                        alt="Full bottle"
                        className="w-full rounded-lg border border-border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Wine Details */}
              <div className="space-y-4">
                {selectedItem.producer && (
                  <div>
                    <Label className="text-wine-champagne text-xs">Producer</Label>
                    <p className="text-foreground text-lg">{selectedItem.producer}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.vintage_year && (
                    <div>
                      <Label className="text-wine-champagne text-xs">Vintage</Label>
                      <p className="text-foreground">{selectedItem.vintage_year}</p>
                    </div>
                  )}
                  {selectedItem.wine_type && (
                    <div>
                      <Label className="text-wine-champagne text-xs">Type</Label>
                      <p className="text-foreground capitalize">{selectedItem.wine_type}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.country && (
                    <div>
                      <Label className="text-wine-champagne text-xs">Country</Label>
                      <p className="text-foreground">{selectedItem.country}</p>
                    </div>
                  )}
                  {selectedItem.region && (
                    <div>
                      <Label className="text-wine-champagne text-xs">Region</Label>
                      <p className="text-foreground">{selectedItem.region}</p>
                    </div>
                  )}
                </div>

                {selectedItem.grape_varietals && (
                  <div>
                    <Label className="text-wine-champagne text-xs">Grape Varietals</Label>
                    <p className="text-foreground">{selectedItem.grape_varietals}</p>
                  </div>
                )}

                {selectedItem.description && (
                  <div>
                    <Label className="text-wine-champagne text-xs">Description</Label>
                    <p className="text-foreground/90 whitespace-pre-wrap">{selectedItem.description}</p>
                  </div>
                )}

                {selectedItem.notes && (
                  <div>
                    <Label className="text-wine-champagne text-xs">Why you want it</Label>
                    <p className="text-foreground/90 whitespace-pre-wrap">{selectedItem.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button
                  variant="destructive"
                  onClick={() => {
                    confirmDelete(selectedItem.id, selectedItem.wine_name);
                    setDetailDialogOpen(false);
                  }}
                  className="flex-1"
                >
                  <BinIcon className="h-4 w-4 mr-2" />
                  Remove from Wishlist
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Remove from Wishlist?</AlertDialogTitle>
            <AlertDialogDescription className="text-wine-champagne">
              Are you sure you want to remove this wine from your wishlist? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-card text-foreground hover:bg-secondary border-border">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Wishlist;
