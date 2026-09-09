import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { removeWineBackground, describeWine } from "@/lib/wine-ai.functions";

import Layout from "@/components/Layout";
import { CaveStickyHeader, CaveSheet, Eyebrow, Plate } from "@/components/CaveChrome";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wine, MapPin, Calendar, Percent, DollarSign, Edit, Trash2, Plus, Sparkles, Upload, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateWineData } from "@/lib/wineValidation";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrapeList } from "@/lib/normalizeGrape";
import { normalizeImageOrientation } from "@/lib/normalizeImageOrientation";

/* The four views a bottle has. Fixed order, so the plate can report "3 of 4"
   and name the one that has no photo yet. */
const IMAGE_SLOTS = [
  { key: "front", label: "Front label" },
  { key: "back", label: "Back label" },
  { key: "neck", label: "Neck" },
  { key: "overall", label: "Full bottle" },
] as const;

interface WineData {
  id: string;
  wine_name: string;
  producer: string | null;
  vintage_year: number | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  alcohol_content: number | null;
  current_stock: number;
  price_per_bottle: number | null;
  storage_location: string | null;
  storage_locations?: Array<{location: string; quantity: number}>;
  ai_tasting_notes: string | null;
  ai_food_pairings: string[] | null;
  optimal_drinking_window: string | null;
  grape_varietals: any;
  images: any;
  created_at: string;
  description?: string | null;
  description_sources?: string[] | null;
  notes?: string | null;
}
interface TastingNote {
  id: string;
  tasting_date: string;
  rating: number;
  notes: string | null;
  occasion: string | null;
  food_pairing: string | null;
}
const WineDetail = () => {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const removeWineBackgroundFn = useServerFn(removeWineBackground);
  const describeWineFn = useServerFn(describeWine);
  const [rewritingDescription, setRewritingDescription] = useState(false);
  const [wine, setWine] = useState<WineData | null>(null);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [editStockDialogOpen, setEditStockDialogOpen] = useState(false);
  const [editWineDialogOpen, setEditWineDialogOpen] = useState(false);
  const [newStock, setNewStock] = useState(0);
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState("");
  const [occasion, setOccasion] = useState("");
  const [foodPairing, setFoodPairing] = useState("");
  const [processingBackground, setProcessingBackground] = useState(false);
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ location: "", quantity: 1 });
  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);

  // Flip card state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  // Edit tasting note state
  const [editingTastingNoteId, setEditingTastingNoteId] = useState<string | null>(null);
  const [editTastingForm, setEditTastingForm] = useState({
    rating: 5,
    notes: "",
    occasion: "",
    food_pairing: "",
    tasting_date: ""
  });

  // Edit wine form state
  const [editForm, setEditForm] = useState({
    wine_name: "",
    producer: "",
    vintage_year: "",
    wine_type: "",
    country: "",
    region: "",
    appellation: "",
    alcohol_content: "",
    price_per_bottle: "",
    storage_location: "",
    notes: "",
    description: "",
    grape_varietals: "",
    optimal_drinking_window: ""
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newImages, setNewImages] = useState<{[key: string]: File}>({});
  const [additionalImageKeys, setAdditionalImageKeys] = useState<string[]>([]);
  /* Cycles the four label slots rather than only the photos that exist, so the
     caption can say which view is missing. The shipped 300ms flip, quieted to
     the 180ms dip the plate uses. */
  const handleCardClick = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => {
      setCurrentImageIndex(prev => (prev + 1) % IMAGE_SLOTS.length);
      setIsFlipping(false);
    }, 180);
  };
  useEffect(() => {
    if (id) {
      fetchWine();
      fetchTastingNotes();
      fetchLocations();
    }
  }, [id]);

  const fetchLocations = async () => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const { data } = await supabase
        .from("wines")
        .select("storage_locations")
        .eq("user_id", session.data.session.user.id);

      if (data) {
        const allLocations = data.flatMap(w => {
          if (Array.isArray(w.storage_locations)) {
            return w.storage_locations.map((loc: any) => loc.location);
          }
          return [];
        });
        const uniqueLocations = [...new Set(allLocations.filter(Boolean))] as string[];
        setSavedLocations(uniqueLocations);
      }
    } catch (error) {
      console.error("Failed to fetch locations:", error);
    }
  };
  const fetchWine = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("wines").select("*").eq("id", id ?? "").single();
      if (error) throw error;
      
      // Transform storage_locations from Json to proper type
      const wineData = {
        ...data,
        storage_locations: Array.isArray(data.storage_locations) 
          ? data.storage_locations as Array<{location: string; quantity: number}>
          : []
      } as unknown as WineData;
      setWine(wineData);

      // Initialize edit form with current values
      setEditForm({
        wine_name: data.wine_name || "",
        producer: data.producer || "",
        vintage_year: data.vintage_year?.toString() || "",
        wine_type: data.wine_type || "",
        country: data.country || "",
        region: data.region || "",
        appellation: data.appellation || "",
        alcohol_content: data.alcohol_content?.toString() || "",
        price_per_bottle: data.price_per_bottle?.toString() || "",
        storage_location: data.storage_location || "",
        notes: data.notes || "",
        description: data.description || "",
        grape_varietals: Array.isArray(data.grape_varietals) ? data.grape_varietals.join(', ') : "",
        optimal_drinking_window: data.optimal_drinking_window || ""
      });
    } catch (error: any) {
      toast.error("Failed to load wine details");
      navigate("/cellar");
    } finally {
      setLoading(false);
    }
  };
  const fetchTastingNotes = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("tasting_notes").select("*").eq("wine_id", id ?? "").order("tasting_date", {
        ascending: false
      });
      if (error) throw error;
      setTastingNotes((data || []) as unknown as TastingNote[]);
    } catch (error) {
      console.error("Failed to fetch tasting notes:", error);
    }
  };
  const handleConsume = async () => {
    if (!wine) return;
    try {
      // Add tasting note
      const {
        error: noteError
      } = await supabase.from("tasting_notes").insert({
        wine_id: wine.id,
        user_id: (await supabase.auth.getUser()).data.user?.id ?? "",
        rating,
        notes: notes || null,
        occasion: occasion || null,
        food_pairing: foodPairing || null
      });
      if (noteError) throw noteError;

      // Update stock
      const newStockCount = Math.max(0, wine.current_stock - 1);
      
      const {
        error: updateError
      } = await supabase.from("wines").update({
        current_stock: newStockCount
      }).eq("id", wine.id);
      if (updateError) throw updateError;
      
      if (newStockCount === 0) {
        toast.success("Last bottle consumed! Wine moved to archive. You can view it in your cellar's archive.");
      } else {
        toast.success("Tasting note added!");
      }
      
      setConsumeDialogOpen(false);
      setRating(5);
      setNotes("");
      setOccasion("");
      setFoodPairing("");
      fetchWine();
      fetchTastingNotes();
    } catch (error: any) {
      toast.error("Failed to log consumption");
    }
  };
  const handleDelete = async () => {
    if (!wine || !confirm("Are you sure you want to delete this wine?")) return;
    try {
      const {
        error
      } = await supabase.from("wines").delete().eq("id", wine.id);
      if (error) throw error;
      toast.success("Wine deleted");
      navigate("/cellar");
    } catch (error: any) {
      toast.error("Failed to delete wine");
    }
  };
  
  const handleSaveLocation = async () => {
    if (!wine || !newLocation.location.trim()) {
      toast.error("Please enter a location");
      return;
    }

    try {
      const currentLocations = wine.storage_locations || [];
      let updatedLocations;
      let newTotalStock = wine.current_stock;

      if (editingLocationIndex !== null) {
        // Editing existing location
        updatedLocations = currentLocations.map((loc, idx) => 
          idx === editingLocationIndex ? newLocation : loc
        );
        // Recalculate total stock
        newTotalStock = updatedLocations.reduce((sum, loc) => sum + loc.quantity, 0);
      } else {
        // Adding new location
        updatedLocations = [...currentLocations, newLocation];
        newTotalStock = wine.current_stock + newLocation.quantity;
      }

      const { error } = await supabase
        .from("wines")
        .update({ 
          storage_locations: updatedLocations,
          current_stock: newTotalStock
        })
        .eq("id", wine.id);

      if (error) throw error;

      toast.success(editingLocationIndex !== null ? "Location updated!" : "Location added!");
      setLocationDialogOpen(false);
      setNewLocation({ location: "", quantity: 1 });
      setEditingLocationIndex(null);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to save location");
    }
  };

  const handleDeleteLocation = async (index: number) => {
    if (!wine || !confirm("Remove this storage location?")) return;

    try {
      const currentLocations = wine.storage_locations || [];
      const locationToRemove = currentLocations[index];
      const updatedLocations = currentLocations.filter((_, idx) => idx !== index);
      const newTotalStock = wine.current_stock - locationToRemove.quantity;

      const { error } = await supabase
        .from("wines")
        .update({ 
          storage_locations: updatedLocations,
          current_stock: Math.max(0, newTotalStock)
        })
        .eq("id", wine.id);

      if (error) throw error;

      toast.success("Location removed!");
      setLocationDialogOpen(false);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to remove location");
    }
  };
  
  const handleUpdateStock = async () => {
    if (!wine) return;
    
    try {
      const {
        error
      } = await supabase.from("wines").update({
        current_stock: newStock
      }).eq("id", wine.id);
      if (error) throw error;
      
      if (newStock === 0) {
        toast.success("Stock updated to zero! Wine moved to archive.");
      } else {
        toast.success("Stock updated!");
      }
      
      setEditStockDialogOpen(false);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to update stock");
    }
  };
  const handleUpdateWine = async () => {
    if (!wine) return;
    
    // Validate input data before processing
    const validation = validateWineData(editForm);
    if (!validation.success) {
      toast.error(`Validation Error: ${validation.error}`);
      return;
    }
    
    try {
      setUploadingImages(true);
      const session = await supabase.auth.getSession();
      
      // Upload new images if any
      let updatedImages = { ...wine.images };
      if (Object.keys(newImages).length > 0) {
        for (const [type, file] of Object.entries(newImages)) {
          const fileName = `${session.data.session?.user.id}/${type}_${Date.now()}.${file.name.split('.').pop()}`;
          const { error: uploadError } = await supabase.storage
            .from('wine-images')
            .upload(fileName, file);
          
          if (uploadError) {
            console.error(`Upload error for ${type}:`, uploadError);
            toast.error(`Failed to upload ${type} image`);
            continue;
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('wine-images')
            .getPublicUrl(fileName);
          
          updatedImages[type] = publicUrl;
        }
      }
      
      const normalizedGrapes = editForm.grape_varietals ? normalizeGrapeList(editForm.grape_varietals.split(',')) : [];
      const grapeArray = normalizedGrapes.length > 0 ? normalizedGrapes : null;
      const validWineTypes = ['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'];
      const wineType = editForm.wine_type && validWineTypes.includes(editForm.wine_type.toLowerCase()) ? editForm.wine_type.toLowerCase() : null;
      const {
        error
      } = await supabase.from("wines").update({
        wine_name: editForm.wine_name || undefined,
        producer: editForm.producer || null,
        vintage_year: editForm.vintage_year ? parseInt(editForm.vintage_year) : null,
        wine_type: wineType as any,
        country: normalizeCountry(editForm.country),
        region: editForm.region || null,
        appellation: editForm.appellation || null,
        alcohol_content: editForm.alcohol_content ? parseFloat(editForm.alcohol_content) : null,
        price_per_bottle: editForm.price_per_bottle ? parseFloat(editForm.price_per_bottle) : null,
        storage_location: editForm.storage_location || null,
        notes: editForm.notes || null,
        description: editForm.description || null,
        grape_varietals: grapeArray,
        optimal_drinking_window: editForm.optimal_drinking_window || null,
        images: updatedImages
      }).eq("id", wine.id);
      if (error) throw error;
      
      // Close dialog and refresh data
      setEditWineDialogOpen(false);
      setNewImages({});
      await fetchWine();
      toast.success("Wine updated!");
    } catch (error: any) {
      toast.error("Failed to update wine");
    } finally {
      setUploadingImages(false);
    }
  };
  const handleRewriteDescription = async () => {
    if (!wine) return;
    setRewritingDescription(true);
    try {
      const grapes = Array.isArray(wine.grape_varietals) ? wine.grape_varietals.join(", ") : wine.grape_varietals ?? null;
      const result = (await describeWineFn({
        data: {
          wine_name: wine.wine_name,
          producer: wine.producer,
          vintage_year: wine.vintage_year,
          region: wine.region,
          country: wine.country,
          grape_varietals: grapes
        }
      })) as { description: string; sources?: string[] };
      if (!result?.description) throw new Error("No description returned");
      const sources = Array.isArray(result.sources) && result.sources.length > 0 ? result.sources : null;
      const { error } = await supabase.from("wines").update({ description: result.description, description_sources: sources }).eq("id", wine.id);
      if (error) throw error;
      setWine(prev => prev ? { ...prev, description: result.description, description_sources: sources } : prev);
      setEditForm(prev => ({ ...prev, description: result.description }));
      toast.success("Description rewritten from web research");
    } catch (error: any) {
      console.error("Rewrite description failed:", error);
      toast.error(error?.message || "Failed to rewrite description");
    } finally {
      setRewritingDescription(false);
    }
  };
  const handleRemoveBackground = async () => {
    const frontUrl = wine?.images?.front;
    if (!wine || !frontUrl) {
      toast.error("Add a front-label image first");
      return;
    }
    setProcessingBackground(true);
    const session = await supabase.auth.getSession();
    try {
      toast.info("Processing front label...");
      const data = await removeWineBackgroundFn({
        data: { imageUrl: frontUrl as string }
      });
      if (!data.processedImage) throw new Error("No visible front image returned");

      const base64Data = data.processedImage.split(',')[1];
      if (!base64Data) throw new Error("Invalid front image returned");
      const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob());
      if (!blob.size) throw new Error("Blank front image returned");

      const ownerId = session.data.session?.user.id;
      if (!ownerId) throw new Error("Not signed in");
      const fileName = `${ownerId}/front_cleaned_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('wine-images')
        .upload(fileName, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('wine-images')
        .getPublicUrl(fileName);

      const updatedImages = { ...wine.images, front: publicUrl };
      const { error: updateError } = await supabase
        .from('wines')
        .update({ images: updatedImages })
        .eq('id', wine.id);
      if (updateError) throw updateError;
      toast.success('Front label background cleaned');
      fetchWine();
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error(error.message || 'Failed to clean backgrounds');
    } finally {
      setProcessingBackground(false);
    }
  };

  const handleEditTastingNote = (note: TastingNote) => {
    setEditingTastingNoteId(note.id);
    setEditTastingForm({
      rating: note.rating,
      notes: note.notes || "",
      occasion: note.occasion || "",
      food_pairing: note.food_pairing || "",
      tasting_date: note.tasting_date
    });
  };

  const handleUpdateTastingNote = async () => {
    if (!editingTastingNoteId) return;
    try {
      const { error } = await supabase
        .from("tasting_notes")
        .update({
          rating: editTastingForm.rating,
          notes: editTastingForm.notes || null,
          occasion: editTastingForm.occasion || null,
          food_pairing: editTastingForm.food_pairing || null,
          tasting_date: editTastingForm.tasting_date
        })
        .eq("id", editingTastingNoteId);
      
      if (error) throw error;
      
      setEditingTastingNoteId(null);
      await fetchTastingNotes();
      toast.success("Tasting note updated!");
    } catch (error: any) {
      toast.error("Failed to update tasting note");
    }
  };

  const handleDeleteTastingNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this tasting note?")) return;
    try {
      const { error } = await supabase
        .from("tasting_notes")
        .delete()
        .eq("id", noteId);
      
      if (error) throw error;
      
      await fetchTastingNotes();
      toast.success("Tasting note deleted!");
    } catch (error: any) {
      toast.error("Failed to delete tasting note");
    }
  };
  if (loading || !wine) {
    return <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        </div>
      </Layout>;
  }
  const images = (wine.images ?? {}) as Record<string, string>;
  const currentImage = images[IMAGE_SLOTS[currentImageIndex].key] ?? null;

  /* The window is free text ("2024-2030"). Read the years out of it; say
     nothing when it cannot be read rather than asserting a status. */
  const windowYears = wine.optimal_drinking_window?.match(/\d{4}/g) ?? null;
  const drinkUntil = windowYears ? windowYears[windowYears.length - 1] : null;
  const inWindow = (() => {
    if (!windowYears) return false;
    const now = new Date().getFullYear();
    const from = Number(windowYears[0]);
    const to = Number(windowYears[windowYears.length - 1]);
    return now >= from && now <= to;
  })();

  const grapeList = Array.isArray(wine.grape_varietals)
    ? wine.grape_varietals.map((g: any) => (typeof g === "string" ? g : g?.name)).filter(Boolean).join(", ")
    : "";

  // Only rows the bottle actually has. Nothing is invented to fill the list.
  const infoRows = [
    { label: "Producer", value: wine.producer },
    { label: "Type", value: wine.wine_type },
    { label: "Grapes", value: grapeList || null },
    { label: "Appellation", value: wine.appellation },
    { label: "Region", value: wine.region },
    { label: "Country", value: wine.country },
    { label: "Alcohol", value: wine.alcohol_content ? `${wine.alcohol_content}%` : null },
    { label: "Drinking window", value: wine.optimal_drinking_window },
    { label: "My note", value: wine.notes },
  ].filter((r): r is { label: string; value: string } => Boolean(r.value));

  return <Layout>
      <div className="min-h-screen">
        <CaveStickyHeader title={wine.wine_name} status={`${wine.current_stock} in stock`} />

        <div className="mx-auto max-w-[1180px] px-7 pt-8 pb-10">
          {/* Back row */}
          <button
            onClick={() => navigate("/cellar")}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground transition-colors duration-[320ms] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            The cellar
          </button>

          {/* Header row. The plate is part of the card, not its own column: a
              full-height panel wasted the phone screen. */}
          <div className="mt-7 flex flex-wrap items-start gap-7">
            <div className="flex-[0_0_clamp(98px,26vw,260px)]">
              <button
                type="button"
                onClick={handleCardClick}
                aria-label="Turn the bottle"
                className="block w-full"
              >
                <Plate
                  className={`w-full transition-all duration-[180ms] ease-[var(--ease-cave)] ${isFlipping ? "scale-[0.93] opacity-30" : ""}`}
                >
                  {currentImage ? (
                    <img src={currentImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Wine className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
                    </span>
                  )}
                </Plate>
              </button>

              <div className="mt-3 flex items-center gap-1.5">
                {IMAGE_SLOTS.map((slot, i) => (
                  <span
                    key={slot.key}
                    className={`h-[3px] transition-all duration-[320ms] ${i === currentImageIndex ? "w-[22px] bg-primary" : "w-[8px] bg-muted"}`}
                  />
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                {IMAGE_SLOTS[currentImageIndex]?.label ?? "Label"} · {currentImageIndex + 1} of {IMAGE_SLOTS.length}
                {currentImage ? "" : " · no photo yet"}
              </p>
            </div>

            <div className="min-w-[240px] flex-1">
              <h1 className="font-serif font-bold leading-[1.04] tracking-[-0.02em] text-foreground text-[clamp(26px,4.6vw,50px)]">
                {wine.wine_name} {wine.vintage_year || ""}
              </h1>
              <p className="mt-2 font-mono text-[11px] tracking-[0.05em] text-wine-champagne">
                {[[wine.region, wine.country].filter(Boolean).join(", "), wine.appellation].filter(Boolean).join(" · ")}
              </p>
              {inWindow && (
                <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-primary">
                  <span className="cave-ember inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  In its window
                </p>
              )}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                Tap the label to turn the bottle
              </p>
            </div>
          </div>

          {/* Facts strip. Three only: a fourth orphaned at sheet width, and the
              vintage is already in the headline and the list below. */}
          <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-6 border-y border-border py-6">
            <div>
              <div className="font-serif text-[26px] leading-none text-foreground">{wine.current_stock}</div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">in stock</div>
            </div>
            <div>
              <div className="font-serif text-[26px] leading-none text-foreground">
                {wine.alcohol_content ? `${wine.alcohol_content}%` : "—"}
              </div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">alcohol</div>
            </div>
            <div>
              <div className="font-serif text-[26px] leading-none text-foreground">{drinkUntil ?? "—"}</div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">drink until</div>
            </div>
          </div>

          {/* 1. Description */}
          <section className="mt-11">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-2">
              <Eyebrow>Description</Eyebrow>
              <button
                onClick={handleRewriteDescription}
                disabled={rewritingDescription}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition-colors duration-[320ms] hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${rewritingDescription ? "animate-spin" : ""}`} />
                {rewritingDescription ? "Researching…" : "Rewrite description"}
              </button>
            </div>
            <p className={`mt-4 max-w-[70ch] text-[16px] leading-[1.65] text-wine-champagne transition-opacity duration-[420ms] ${rewritingDescription ? "opacity-45" : ""}`}>
              {wine.description || "No description yet. Use Rewrite description to look this wine up on the web."}
            </p>
            {wine.description_sources && wine.description_sources.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                {wine.description_sources.map(url => {
                  let label = url;
                  try {
                    label = new URL(url).hostname.replace(/^www\./, "");
                  } catch {
                    label = url;
                  }
                  return <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="border-b border-border font-mono text-[10px] tracking-[0.05em] text-muted-foreground transition-colors duration-[320ms] hover:text-foreground">
                      {label}
                    </a>;
                })}
              </div>}
          </section>

          {/* 2. What the model knows */}
          {(wine.ai_tasting_notes || (wine.ai_food_pairings && wine.ai_food_pairings.length > 0)) && (
            <section className="mt-11">
              <div className="border-b border-border pb-2">
                <Eyebrow>What the model knows</Eyebrow>
              </div>
              {wine.ai_tasting_notes && (
                <p className="mt-4 max-w-[46ch] font-serif text-[22px] leading-[1.4] text-foreground">
                  {wine.ai_tasting_notes}
                </p>
              )}
              {wine.ai_food_pairings && wine.ai_food_pairings.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {wine.ai_food_pairings.map((pairing, index) => (
                    <span
                      key={index}
                      className="border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.07em] text-wine-champagne transition-colors duration-[320ms] hover:border-primary hover:text-primary"
                    >
                      {pairing}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Wine information */}
          <section className="mt-11">
            <div className="border-b border-border pb-2">
              <Eyebrow>Wine information</Eyebrow>
            </div>
            <dl className="mt-1">
              {infoRows.map(row => (
                <div key={row.label} className="flex items-baseline justify-between gap-6 border-b border-muted py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{row.label}</dt>
                  <dd className="text-right text-[14px] text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* 4. Where the bottles are */}
          <section className="mt-11">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-2">
              <Eyebrow>Where the bottles are</Eyebrow>
              <button
                onClick={() => {
                  setNewLocation({ location: "", quantity: 1 });
                  setEditingLocationIndex(null);
                  setLocationDialogOpen(true);
                }}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition-colors duration-[320ms] hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Add a location
              </button>
            </div>
            {wine.storage_locations && wine.storage_locations.length > 0 && (
              <div className="mt-1">
                {wine.storage_locations.map((loc, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setNewLocation(loc);
                      setEditingLocationIndex(index);
                      setLocationDialogOpen(true);
                    }}
                    className="flex w-full items-baseline justify-between gap-6 border-b border-muted py-3 text-left transition-colors duration-[320ms] hover:bg-secondary/50"
                  >
                    <span className="flex items-center gap-2 text-[14px] text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {loc.location}
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.05em] text-wine-champagne">
                      {loc.quantity} bottles
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-4 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
              Bought {new Date(wine.created_at).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })}
              {wine.price_per_bottle ? ` · $${wine.price_per_bottle.toFixed(0)} a bottle` : ""}
              {" · "}
              <button
                onClick={() => {
                  setNewStock(wine.current_stock);
                  setEditStockDialogOpen(true);
                }}
                className="underline underline-offset-4 transition-colors duration-[320ms] hover:text-foreground"
              >
                {wine.current_stock} in stock
              </button>
            </p>
          </section>

          {/* 5. My tasting notes */}
          <section className="mt-11">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
              <Eyebrow>My tasting notes</Eyebrow>
              <span className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground">{tastingNotes.length}</span>
            </div>
            {tastingNotes.length === 0 ? (
              <p className="mt-4 text-[15px] text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <div className="mt-1">
                {tastingNotes.map(note => (
                  <div key={note.id} className="border-b border-muted py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                        {new Date(note.tasting_date).toLocaleDateString()}
                      </span>
                      <span className="text-accent">
                        {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                      </span>
                    </div>
                    {note.notes && <p className="mt-2 max-w-[70ch] text-[15px] leading-[1.6] text-foreground">{note.notes}</p>}
                    {(note.occasion || note.food_pairing) && (
                      <p className="mt-2 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                        {[note.occasion, note.food_pairing].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="mt-11 flex flex-wrap gap-3">
            <Button className="flex-[1_1_240px]" onClick={() => setConsumeDialogOpen(true)}>
              Record your tasting note
            </Button>
            <Button variant="outline" onClick={() => setEditWineDialogOpen(true)}>
              <Edit className="h-4 w-4" />
              Edit wine
            </Button>
            <button
              onClick={handleDelete}
              className="px-4 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition-colors duration-[320ms] hover:text-destructive"
            >
              Delete
            </button>
          </div>

          {/* Tasting sheet */}
          <CaveSheet open={consumeDialogOpen} onClose={() => setConsumeDialogOpen(false)} labelledBy="tasting-sheet-title">
            <div className="p-7">
              <h2 id="tasting-sheet-title" className="font-serif text-[26px] text-foreground">Record your tasting note</h2>

              <div className="mt-6">
                <Eyebrow>Rating</Eyebrow>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      aria-label={`${star} of 5`}
                      className={`text-[30px] leading-none ${star <= rating ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {star <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <Eyebrow>Tasting notes</Eyebrow>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the flavors, aromas..." className="mt-2 bg-background" />
              </div>
              <div className="mt-5">
                <Eyebrow>Occasion</Eyebrow>
                <Input value={occasion} onChange={e => setOccasion(e.target.value)} placeholder="Dinner party, celebration..." className="mt-2 bg-background" />
              </div>
              <div className="mt-5">
                <Eyebrow>Paired with</Eyebrow>
                <Input value={foodPairing} onChange={e => setFoodPairing(e.target.value)} placeholder="What did you pair it with?" className="mt-2 bg-background" />
              </div>

              <Button onClick={handleConsume} className="mt-7 w-full">
                Save tasting note · one bottle out
              </Button>
              <p className="mt-3 text-center font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                {wine.current_stock} in stock now · {Math.max(0, wine.current_stock - 1)} after this
              </p>
            </div>
          </CaveSheet>


          {/* Stock Edit Dialog */}
          <Dialog open={editStockDialogOpen} onOpenChange={setEditStockDialogOpen}>
            <DialogContent className="bg-popover text-foreground border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Update Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Number of Bottles</Label>
                  <Input type="number" min="0" value={newStock} onChange={e => setNewStock(parseInt(e.target.value) || 0)} className="bg-card border-border text-foreground" />
                </div>
                <Button onClick={handleUpdateStock} className="w-full bg-primary hover:opacity-90">
                  Update Stock
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Wine Dialog */}
          <Dialog open={editWineDialogOpen} onOpenChange={setEditWineDialogOpen}>
            <DialogContent className="bg-popover text-foreground border-border max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="text-foreground">Edit Wine Details</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Wine Name</Label>
                    <Input value={editForm.wine_name} onChange={e => setEditForm({
                    ...editForm,
                    wine_name: e.target.value
                  })} placeholder="Wine name" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Producer</Label>
                    <Input value={editForm.producer} onChange={e => setEditForm({
                    ...editForm,
                    producer: e.target.value
                  })} placeholder="Producer name" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Vintage Year</Label>
                    <Input type="number" value={editForm.vintage_year} onChange={e => setEditForm({
                    ...editForm,
                    vintage_year: e.target.value
                  })} placeholder="2020" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Wine Type</Label>
                    <Input value={editForm.wine_type} onChange={e => setEditForm({
                    ...editForm,
                    wine_type: e.target.value
                  })} placeholder="Red, White, Rosé, etc." className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Country</Label>
                    <Input value={editForm.country} onChange={e => setEditForm({
                    ...editForm,
                    country: e.target.value
                  })} placeholder="France, Italy, etc." className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Region</Label>
                    <Input value={editForm.region} onChange={e => setEditForm({
                    ...editForm,
                    region: e.target.value
                  })} placeholder="Bordeaux, Tuscany, etc." className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Appellation</Label>
                    <Input value={editForm.appellation} onChange={e => setEditForm({
                    ...editForm,
                    appellation: e.target.value
                  })} placeholder="e.g., Pauillac, Chianti Classico" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Grape Varietals</Label>
                    <Input value={editForm.grape_varietals} onChange={e => setEditForm({
                    ...editForm,
                    grape_varietals: e.target.value
                  })} placeholder="e.g., Cabernet Sauvignon, Merlot" className="bg-card border-border text-foreground" />
                    <p className="text-xs text-muted-foreground">Separate multiple grapes with commas</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Alcohol Content (%)</Label>
                    <Input type="number" step="0.1" value={editForm.alcohol_content} onChange={e => setEditForm({
                    ...editForm,
                    alcohol_content: e.target.value
                  })} placeholder="13.5" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Price ($)</Label>
                    <Input type="number" step="0.01" value={editForm.price_per_bottle} onChange={e => setEditForm({
                    ...editForm,
                    price_per_bottle: e.target.value
                  })} placeholder="50.00" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Storage Location</Label>
                    {savedLocations.length > 0 && (
                      <Select 
                        value={editForm.storage_location} 
                        onValueChange={value => {
                          if (value === "custom") {
                            setEditForm({
                              ...editForm,
                              storage_location: ""
                            });
                          } else {
                            setEditForm({
                              ...editForm,
                              storage_location: value
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="bg-card border-border text-foreground">
                          <SelectValue placeholder="Select or enter location" />
                        </SelectTrigger>
                        <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                          {savedLocations.map(location => (
                            <SelectItem key={location} value={location}>
                              {location}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">+ Add New Location</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {(!editForm.storage_location || !savedLocations.includes(editForm.storage_location)) && (
                      <Input 
                        value={editForm.storage_location} 
                        onChange={e => setEditForm({
                          ...editForm,
                          storage_location: e.target.value
                        })} 
                        placeholder="e.g., Rack A3, Wine Cellar" 
                        className={`bg-card border-border text-foreground ${savedLocations.length > 0 ? "mt-2" : ""}`}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Optimal Drinking Window</Label>
                    <Input value={editForm.optimal_drinking_window} onChange={e => setEditForm({
                    ...editForm,
                    optimal_drinking_window: e.target.value
                  })} placeholder="e.g., 2025-2035" className="bg-card border-border text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Description</Label>
                    <Textarea value={editForm.description} onChange={e => setEditForm({
                    ...editForm,
                    description: e.target.value
                  })} placeholder="Wine description..." className="bg-card border-border text-foreground" rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Notes</Label>
                    <Textarea value={editForm.notes} onChange={e => setEditForm({
                    ...editForm,
                    notes: e.target.value
                  })} placeholder="Add personal notes about this wine..." className="bg-card border-border text-foreground" rows={4} />
                  </div>

                  {/* My Tasting Notes Section */}
                  {tastingNotes.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-border">
                      <h4 className="text-foreground font-semibold">My Tasting Notes</h4>
                      {tastingNotes.map(note => (
                        <div key={note.id} className="bg-popover rounded-lg p-3 space-y-3">
                          {editingTastingNoteId === note.id ? (
                            <>
                              <div className="space-y-2">
                                <Label className="text-foreground text-xs">Rating</Label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setEditTastingForm({...editTastingForm, rating: star})}
                                      className="text-xl text-accent"
                                    >
                                      {star <= editTastingForm.rating ? "★" : "☆"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-foreground text-xs">Tasting Date</Label>
                                <Input
                                  type="date"
                                  value={editTastingForm.tasting_date}
                                  onChange={e => setEditTastingForm({...editTastingForm, tasting_date: e.target.value})}
                                  className="bg-card border-border text-foreground text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-foreground text-xs">Notes</Label>
                                <Textarea
                                  value={editTastingForm.notes}
                                  onChange={e => setEditTastingForm({...editTastingForm, notes: e.target.value})}
                                  placeholder="Tasting notes..."
                                  className="bg-card border-border text-foreground text-sm"
                                  rows={2}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-foreground text-xs">Occasion</Label>
                                <Input
                                  value={editTastingForm.occasion}
                                  onChange={e => setEditTastingForm({...editTastingForm, occasion: e.target.value})}
                                  placeholder="Occasion..."
                                  className="bg-card border-border text-foreground text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-foreground text-xs">Food Pairing</Label>
                                <Input
                                  value={editTastingForm.food_pairing}
                                  onChange={e => setEditTastingForm({...editTastingForm, food_pairing: e.target.value})}
                                  placeholder="Food pairing..."
                                  className="bg-card border-border text-foreground text-sm"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={handleUpdateTastingNote}
                                  className="flex-1 bg-primary hover:opacity-90 text-xs py-1 h-8"
                                >
                                  Save
                                </Button>
                                <Button
                                  onClick={() => setEditingTastingNoteId(null)}
                                  variant="outline"
                                  className="flex-1 text-xs py-1 h-8"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(note.tasting_date).toLocaleDateString()}
                                    </span>
                                    <div className="text-accent text-sm">
                                      {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                                    </div>
                                  </div>
                                  {note.notes && <p className="text-foreground text-xs mb-1">{note.notes}</p>}
                                  {note.occasion && <p className="text-xs text-muted-foreground">Occasion: {note.occasion}</p>}
                                  {note.food_pairing && <p className="text-xs text-muted-foreground">Paired with: {note.food_pairing}</p>}
                                </div>
                              </div>
                              <div className="flex gap-2 mt-2">
                                <Button
                                  onClick={() => handleEditTastingNote(note)}
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs py-1 h-7"
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => handleDeleteTastingNote(note.id)}
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1 text-xs py-1 h-7"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Image Upload Section */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <h4 className="text-foreground font-semibold flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Wine Images
                    </h4>
                    
                    {/* Current Images */}
                    {wine.images && Object.keys(wine.images).length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Current Images</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(wine.images).map(([type, url]: [string, any]) => (
                            <div key={type} className="relative bg-popover rounded-lg p-2 aspect-[3/4] flex flex-col">
                              <img 
                                src={url} 
                                alt={`${type} view`} 
                                className="min-h-0 flex-1 w-full object-contain rounded"
                              />
                              <p className="text-xs text-muted-foreground text-center mt-1 capitalize">{type}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Upload New Images */}
                    <div className="space-y-2">
                      <Label className="text-foreground text-xs">Upload New Images</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {['front', 'back', 'overall', 'neck'].map(type => (
                          <div key={type} className="space-y-1">
                            <Label className="text-xs text-muted-foreground capitalize">{type} Label</Label>
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const rawFile = e.target.files?.[0];
                                  if (rawFile) {
                                     const file = await normalizeImageOrientation(rawFile);
                                    setNewImages(prev => ({ ...prev, [type]: file }));
                                  }
                                }}

                                className="hidden"
                                id={`upload-${type}`}
                              />
                              <label
                                htmlFor={`upload-${type}`}
                                className="flex items-center justify-center gap-2 bg-card border border-border rounded-lg p-2 cursor-pointer hover:bg-secondary transition-colors"
                              >
                                {newImages[type] ? (
                                  <div className="flex items-center gap-1 text-xs text-green-400">
                                    <Upload className="h-3 w-3" />
                                    <span className="truncate">{newImages[type].name.slice(0, 12)}...</span>
                                    <X 
                                      className="h-3 w-3 cursor-pointer hover:text-red-400" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setNewImages(prev => {
                                          const updated = { ...prev };
                                          delete updated[type];
                                          return updated;
                                        });
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Upload className="h-3 w-3" />
                                    <span>Choose file</span>
                                  </div>
                                )}
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Additional Images */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-foreground text-xs">Additional Images</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const newKey = `custom_${Date.now()}`;
                            setAdditionalImageKeys(prev => [...prev, newKey]);
                          }}
                          className="h-6 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Image
                        </Button>
                      </div>
                      {additionalImageKeys.length > 0 && (
                        <div className="space-y-2">
                          {additionalImageKeys.map((key, index) => (
                            <div key={key} className="flex items-center gap-2">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const rawFile = e.target.files?.[0];
                                  if (rawFile) {
                                    const file = await normalizeImageOrientation(rawFile);
                                    setNewImages(prev => ({ ...prev, [key]: file }));
                                  }
                                }}

                                className="hidden"
                                id={`upload-additional-${key}`}
                              />
                              <label
                                htmlFor={`upload-additional-${key}`}
                                className="flex-1 flex items-center justify-center gap-2 bg-card border border-border rounded-lg p-2 cursor-pointer hover:bg-secondary transition-colors"
                              >
                                {newImages[key] ? (
                                  <div className="flex items-center gap-1 text-xs text-green-400">
                                    <Upload className="h-3 w-3" />
                                    <span className="truncate">{newImages[key].name.slice(0, 20)}...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Upload className="h-3 w-3" />
                                    <span>Choose additional image</span>
                                  </div>
                                )}
                              </label>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAdditionalImageKeys(prev => prev.filter((_, i) => i !== index));
                                  setNewImages(prev => {
                                    const updated = { ...prev };
                                    delete updated[key];
                                    return updated;
                                  });
                                }}
                                className="h-8 w-8 p-0 text-red-400 hover:text-red-500"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button onClick={handleUpdateWine} disabled={uploadingImages} className="w-full bg-primary hover:opacity-90">
                    {uploadingImages ? "Uploading..." : "Save Changes"}
                  </Button>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          {/* Storage Location Dialog */}
          <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
            <DialogContent className="bg-popover text-foreground border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {editingLocationIndex !== null ? "Edit Storage Location" : "Add Storage Location"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Location</Label>
                  {savedLocations.length > 0 ? (
                    <Select 
                      value={newLocation.location} 
                      onValueChange={value => {
                        if (value === "custom") {
                          setNewLocation({ ...newLocation, location: "" });
                        } else {
                          setNewLocation({ ...newLocation, location: value });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-card border-border text-foreground">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                        {savedLocations.map(location => (
                          <SelectItem key={location} value={location}>
                            {location}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">+ New Location</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {(!newLocation.location || !savedLocations.includes(newLocation.location)) && (
                    <Input
                      value={newLocation.location}
                      onChange={e => setNewLocation({ ...newLocation, location: e.target.value })}
                      placeholder="e.g., Rack A3, Wine Cellar"
                      className={`bg-card border-border text-foreground ${savedLocations.length > 0 ? "mt-2" : ""}`}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newLocation.quantity}
                    onChange={e => setNewLocation({ ...newLocation, quantity: parseInt(e.target.value) || 1 })}
                    className="bg-card border-border text-foreground"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveLocation} 
                    className="flex-1 bg-primary hover:opacity-90"
                  >
                    {editingLocationIndex !== null ? "Update" : "Add"}
                  </Button>
                  {editingLocationIndex !== null && (
                    <Button 
                      onClick={() => handleDeleteLocation(editingLocationIndex)} 
                      variant="destructive"
                      className="flex-1"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Layout>;
};
export default WineDetail;