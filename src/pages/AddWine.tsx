import { sameLocation, sameRack } from "@/lib/rackLabel";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractWineData, describeWine, removeWineBackground } from "@/lib/wine-ai.functions";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrapeList } from "@/lib/normalizeGrape";
import { normalizeImageOrientation } from "@/lib/normalizeImageOrientation";


import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Loader2, Wine, X, Check } from "lucide-react";
import uploadButtonImg from "@/assets/upload-button.png";
import bottleIcon from "@/assets/bottle-icon.png";
import neckButtonImg from "@/assets/neck-button.png";
import frontLabelButtonImg from "@/assets/front-label-button.png";
import fullBottleButtonImg from "@/assets/full-bottle-button.png";
import backLabelButtonImg from "@/assets/back-label-button.png";
import frontIcon from "@/assets/bottle-front-label.png.asset.json";
import backIcon from "@/assets/bottle-back-label.png.asset.json";
import neckIcon from "@/assets/bottle-neck-label.png.asset.json";
import fullIcon from "@/assets/full_bottle.png.asset.json";
import wineVirtueLogoAsset from "@/assets/wine-virtue-seal.png.asset.json";
const wineVirtueLogo = wineVirtueLogoAsset.url;
import { toast } from "sonner";
import { ScanLine, LockCorners, Flash } from "@/components/ScanEffects";
import { Session } from "@supabase/supabase-js";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { validateWineData } from "@/lib/wineValidation";
const AddWine = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const extractWineDataFn = useServerFn(extractWineData);
  const describeWineFn = useServerFn(describeWine);
  const removeWineBackgroundFn = useServerFn(removeWineBackground);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  // Scan effects per photo tile: flash + one sweep on upload, sweep while reading, corners lock after.
  const [shotFire, setShotFire] = useState<Record<string, number>>({});
  const [shotScanning, setShotScanning] = useState<Record<string, boolean>>({});
  const [lockKey, setLockKey] = useState(0);
  const [magicScanCompleted, setMagicScanCompleted] = useState(false);
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [customLoc, setCustomLoc] = useState<Record<number, boolean>>({});
  const [researching, setResearching] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [existingWine, setExistingWine] = useState<any>(null);
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
  const [formData, setFormData] = useState({
    wine_name: "",
    producer: "",
    vintage_year: "",
    wine_type: "",
    country: "",
    region: "",
    alcohol_content: "",
    current_stock: "1",
    price_per_bottle: "",
    storage_location: "",
    grape_varietals: "",
    custom_grape_varietals: "",
    description: "",
    domain_description: "",
    notes: ""
  });
  const [useCustomGrape, setUseCustomGrape] = useState(false);
  const [descriptionSources, setDescriptionSources] = useState<string[]>([]);
  const domainSourcesRef = useRef<string[]>([]);
  const [storageLocations, setStorageLocations] = useState<Array<{
    location: string;
    rack: string;
    quantity: string;
  }>>([{
    location: "",
    rack: "",
    quantity: "1"
  }]);
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch saved locations
  useEffect(() => {
    const fetchLocations = async () => {
      if (!session) return;
      const {
        data
      } = await supabase.from("wines").select("storage_locations").eq("user_id", session.user.id);
      if (data) {
        const seen = new Map<string, string>();
        for (const w of data) {
          if (!Array.isArray(w.storage_locations)) continue;
          for (const loc of w.storage_locations as any[]) {
            const name = String(loc?.location ?? "").trim().replace(/\s+/g, " ");
            if (!name) continue;
            const key = name.toLowerCase();
            if (!seen.has(key)) seen.set(key, name);
          }
        }
        setSavedLocations([...seen.values()]);
      }
    };
    fetchLocations();
  }, [session]);
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back' | 'neck' | 'overall') => {
    const rawFile = e.target.files?.[0];
    if (rawFile) {
      const file = await normalizeImageOrientation(rawFile);
      setImages(prev => ({
        ...prev,
        [type]: file
      }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({
          ...prev,
          [type]: reader.result as string
        }));
        setShotFire(prev => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }));
        setShotScanning(prev => ({ ...prev, [type]: true }));
        window.setTimeout(() => setShotScanning(prev => ({ ...prev, [type]: false })), 2400);
      };
      reader.readAsDataURL(file);
    }
  };

  const scanBusyRef = useRef(false);
  const scanDirtyRef = useRef(false);
  const [rescanTick, setRescanTick] = useState(0);
  const allFourShot = Object.values(images).filter(Boolean).length === 4;
  const processImageWithAI = async () => {
    if (!session) return;

    // Collect all available images
    const availableImages = Object.entries(images).filter(([_, file]) => file !== null).map(([type, file]) => ({
      type,
      file: file!
    }));
    if (availableImages.length === 0) return;
    setAiProcessing(true);
    try {
      const imagePromises = availableImages.map(({
        type,
        file
      }) => {
        return new Promise<{
          type: string;
          base64: string;
        }>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              type,
              base64: reader.result as string
            });
          };
          reader.readAsDataURL(file);
        });
      });
      const processedImages = await Promise.all(imagePromises);
      const data = (await extractWineDataFn({
        data: {
          images: processedImages.map(img => ({
            type: img.type,
            data: img.base64
          }))
        }
      })) as { extracted: Record<string, any> };
      if (data?.extracted) {
        // Parse grape varietals from AI response
        let mainGrape = "";
        let additionalGrapes = "";
        if (data.extracted.grape_varietals) {
          const grapes = data.extracted.grape_varietals.split(',').map((g: string) => g.trim());
          if (grapes.length > 0) {
            mainGrape = grapes[0];
            if (grapes.length > 1) {
              additionalGrapes = grapes.slice(1).join(', ');
            }
          }
        }
        setFormData(prev => ({
          ...prev,
          ...data.extracted,
          grape_varietals: mainGrape,
          custom_grape_varietals: additionalGrapes
        }));
        // Labels read: stop the scan lines now; web research runs as its own phase.
        setAiProcessing(false);

        // Look the wine up on the web and write a grounded description
        if (data.extracted.wine_name) {
          setResearching(true);
          try {
            const described = (await describeWineFn({
              data: {
                wine_name: String(data.extracted.wine_name),
                producer: data.extracted.producer ?? null,
                vintage_year: data.extracted.vintage_year ?? null,
                region: data.extracted.region ?? null,
                country: data.extracted.country ?? null,
                grape_varietals: data.extracted.grape_varietals ?? null
              }
            })) as { description: string; sources?: string[]; grape_varietals?: string | null; domain_description?: string | null; domain_sources?: string[] };
            if (described?.domain_description) {
              const dd = described.domain_description;
              setFormData(prev => ({ ...prev, domain_description: dd }));
              domainSourcesRef.current = Array.isArray(described.domain_sources) ? described.domain_sources : [];
            }
            if (!data.extracted.grape_varietals && described?.grape_varietals) {
              const g = described.grape_varietals.split(',').map(x => x.trim()).filter(Boolean);
              if (g.length) setFormData(prev => prev.grape_varietals ? prev : ({
                ...prev,
                grape_varietals: g[0],
                custom_grape_varietals: g.slice(1).join(', ')
              }));
            }
            if (Array.isArray(described?.sources)) {
              setDescriptionSources(described.sources);
            }
            if (described?.description) {
              setFormData(prev => ({
                ...prev,
                description: described.description
              }));
            }
          } catch (err) {
            console.error("Description lookup failed:", err);
          } finally {
            setResearching(false);
          }
        }
        setMagicScanCompleted(true);

        // Scroll to the form
        setTimeout(() => {
          formRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 300);
      }
    } catch (error: any) {
      console.error("AI processing error:", error);
    } finally {
      setAiProcessing(false);
      scanBusyRef.current = false;
      window.setTimeout(() => setLockKey(k => k + 1), 280);
      if (scanDirtyRef.current) {
        scanDirtyRef.current = false;
        setRescanTick(t => t + 1);
      }
    }
  };

  // Auto-scan whenever photos change; refine as more views are added.
  useEffect(() => {
    if (!session) return;
    if (!Object.values(images).some(Boolean)) return;
    const t = window.setTimeout(() => {
      if (scanBusyRef.current) { scanDirtyRef.current = true; return; }
      scanBusyRef.current = true;
      processImageWithAI();
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, rescanTick, session]);
  const checkForDuplicates = async () => {
    if (!session || !formData.wine_name) return null;

    // Normalize the wine name for comparison (lowercase, trim whitespace)
    const normalizedSearchName = formData.wine_name.toLowerCase().trim();
    const {
      data: allWines
    } = await supabase.from("wines").select("*").eq("user_id", session.user.id);

    // Find wines with matching normalized names
    const duplicate = allWines?.find(wine => wine.wine_name.toLowerCase().trim() === normalizedSearchName);
    return duplicate || null;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    // Check for duplicates if wine name was entered manually (not from AI scan)
    if (!showDuplicateDialog) {
      const duplicate = await checkForDuplicates();
      if (duplicate) {
        setExistingWine(duplicate);
        setShowDuplicateDialog(true);
        return;
      }
    }
    await submitWine();
  };
  const submitWine = async (updateExisting = false) => {
    if (!session) return;

    // Validate input data before processing
    const validation = validateWineData(formData);
    if (!validation.success) {
      toast.error(`Validation Error: ${validation.error}`);
      return;
    }
    setLoading(true);
    try {
      const imageUrls: any = {};

      // Upload all images immediately
      // Clean backgrounds on front/back/neck (never the full bottle); keep original on any failure.
      const toDataUrl = (f: File) => new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(f);
      });
      const entries = Object.entries(images).filter(([, f]) => !!f) as [string, File][];
      const prepared = await Promise.allSettled(entries.map(async ([type, file]) => {
        if (type === "overall") return { type, file };
        try {
          const { processedImage } = await removeWineBackgroundFn({ data: { imageUrl: await toDataUrl(file) } });
          const blob = await (await fetch(processedImage)).blob();
          if (!blob.size) return { type, file };
          return { type, file: new File([blob], `${type}.png`, { type: blob.type || "image/png" }) };
        } catch (err) {
          console.error(`Background removal failed for ${type}:`, err);
          return { type, file };
        }
      }));
      for (let i = 0; i < entries.length; i++) {
        const p = prepared[i];
        const type = entries[i][0];
        const file = p.status === "fulfilled" ? p.value.file : entries[i][1];
        const fileExt = file.name.split(".").pop();
        const fileName = `${session.user.id}/${type}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("wine-images").upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("wine-images").getPublicUrl(fileName);
        imageUrls[type] = publicUrl;
      }
      const allGrapes = normalizeGrapeList([formData.grape_varietals, ...(formData.custom_grape_varietals ? formData.custom_grape_varietals.split(',') : [])]);

      // Coerce typed quantities to valid numbers (minimum 1)
      const normalizedLocations = storageLocations.map(loc => ({
        location: loc.location.trim(),
        ...(loc.rack.trim() ? { rack: loc.rack.trim() } : {}),
        quantity: Math.max(1, parseInt(loc.quantity, 10) || 1)
      })) as Array<{ location: string; rack?: string; quantity: number }>;

      // Calculate total stock from all locations
      const totalStock = normalizedLocations.reduce((sum, loc) => sum + loc.quantity, 0);

      // Filter out empty locations
      const validStorageLocations = normalizedLocations.filter(loc => loc.location.trim() !== "");
      const wineData: any = {
        user_id: session.user.id,
        wine_name: formData.wine_name,
        producer: formData.producer || null,
        vintage_year: formData.vintage_year ? parseInt(formData.vintage_year) : null,
        wine_type: formData.wine_type || null,
        country: normalizeCountry(formData.country),
        region: formData.region || null,
        alcohol_content: formData.alcohol_content ? parseFloat(formData.alcohol_content) : null,
        current_stock: totalStock,
        price_per_bottle: formData.price_per_bottle ? parseFloat(formData.price_per_bottle) : null,
        storage_location: validStorageLocations.length > 0 ? validStorageLocations[0].location : null,
        storage_locations: validStorageLocations,
        grape_varietals: allGrapes.length > 0 ? allGrapes : null,
        images: Object.keys(imageUrls).length > 0 ? imageUrls : null,
        description: formData.description || null,
        description_sources: descriptionSources.length > 0 ? descriptionSources : null,
        domain_description: formData.domain_description || null,
        domain_sources: formData.domain_description && domainSourcesRef.current.length > 0 ? domainSourcesRef.current : null,
        notes: formData.notes || null
      };
      if (updateExisting && existingWine) {
        // Merge new images with existing ones
        const mergedImages = {
          ...(existingWine.images || {}),
          ...imageUrls
        };

        // Merge storage locations
        const existingLocations = (existingWine.storage_locations || []) as Array<{
          location: string;
          rack?: string;
          quantity: number;
        }>;
        const newLocations = [...validStorageLocations];

        // Merge locations: add quantities for same location+rack, append new ones
        const mergedLocations = [...existingLocations];
        newLocations.forEach(newLoc => {
          const existingIndex = mergedLocations.findIndex(loc => sameLocation(loc.location, newLoc.location) && sameRack(loc.rack, newLoc.rack));
          if (existingIndex >= 0) {
            mergedLocations[existingIndex].quantity += newLoc.quantity;
          } else {
            mergedLocations.push(newLoc);
          }
        });
        const newTotalStock = mergedLocations.reduce((sum, loc) => sum + loc.quantity, 0);

        // Build update object: fill empty fields + always update description
        const updates: any = {
          images: mergedImages,
          current_stock: newTotalStock,
          storage_locations: mergedLocations,
          description: formData.description || existingWine.description,
          description_sources: descriptionSources.length > 0 ? descriptionSources : existingWine.description_sources,
          domain_description: formData.domain_description || existingWine.domain_description || null,
          domain_sources: formData.domain_description && domainSourcesRef.current.length > 0 ? domainSourcesRef.current : existingWine.domain_sources ?? null
        };

        // Only update fields that are currently null/empty
        if (!existingWine.producer && wineData.producer) updates.producer = wineData.producer;
        if (!existingWine.vintage_year && wineData.vintage_year) updates.vintage_year = wineData.vintage_year;
        if (!existingWine.wine_type && wineData.wine_type) updates.wine_type = wineData.wine_type;
        if (!existingWine.country && wineData.country) updates.country = wineData.country;
        if (!existingWine.region && wineData.region) updates.region = wineData.region;
        if (!existingWine.alcohol_content && wineData.alcohol_content) updates.alcohol_content = wineData.alcohol_content;
        if (!existingWine.grape_varietals && wineData.grape_varietals) updates.grape_varietals = wineData.grape_varietals;
        const {
          error
        } = await supabase.from("wines").update(updates).eq("id", existingWine.id);
        if (error) throw error;
        toast.success("Wine updated with new photos and details!");
      } else {
        const {
          data,
          error
        } = await supabase.from("wines").insert(wineData).select();
        if (error) throw error;
        toast.success("Wine added to your cellar!");
      }

      // Navigate immediately to cellar
      navigate("/cellar");

    } catch (error: any) {
      toast.error(error.message || "Failed to add wine");
    } finally {
      setLoading(false);
    }
  };
  const hasAnyShot = Boolean(imagePreviews.front || imagePreviews.back || imagePreviews.neck || imagePreviews.overall);

  return <Layout>
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wine Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              "{formData.wine_name}" is already in your cellar. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => {
            setShowDuplicateDialog(false);
            submitWine(false);
          }} className="w-full transition-all">
              Create New Entry
            </AlertDialogAction>
            <AlertDialogAction onClick={() => {
            setShowDuplicateDialog(false);
            submitWine(true);
          }} className="w-full transition-all">
              Add Photos to Existing
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0 transition-all">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-background pb-8">
        <div className="mx-auto max-w-[1180px] bg-background text-primary-foreground px-4 pt-8 pb-6">
          <h1 className="page-title">New Wine</h1>
          <p className="page-subtitle">Snap a photo to fill details <em>automatically</em>.</p>
        </div>

        <div className="mx-auto max-w-[1180px] px-4 mt-6">
          {/* Image Upload */}
          <div className="mb-6 border border-border bg-card p-6 rounded-md">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">SCAN YOUR BOTTLE</p>
            
            {/* Hairline dashed plates. The shipped textured button PNGs are
                deliberately not used here: they fight the palette. The tile
                geometry is unchanged, so reinstating them is a one-line swap. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-4">
              {(['front', 'back', 'neck', 'overall'] as const).map(type => {
              const label = type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : type === 'neck' ? 'Neck' : 'Full bottle';
              return <div key={type}>
                  {imagePreviews[type] ? <div className="group">
                      <div className="relative aspect-3/4 overflow-hidden border border-primary bg-[rgba(244,168,113,0.08)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.75),0_12px_20px_-10px_rgba(0,0,0,0.95),0_2px_4px_rgba(0,0,0,0.6)] rounded-md">
                        <img src={imagePreviews[type]!} alt="" className="h-full w-full object-cover rounded-md" />
                        {shotFire[type] ? <Flash fire={shotFire[type]} /> : null}
                        <ScanLine active={aiProcessing || !!shotScanning[type]} from={4} to={92} ms={2400} />
                        {lockKey > 0 && <LockCorners lock={lockKey} gap={8} />}
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-primary text-primary-foreground rounded-md">
                          <Check className="h-3 w-3" />
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.09em] text-primary">{label} · taken</p>
                      <button type="button" onClick={() => {
                  setImages(prev => ({
                    ...prev,
                    [type]: null
                  }));
                  setImagePreviews(prev => ({
                    ...prev,
                    [type]: null
                  }));
                }} className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition-colors duration-[320ms] hover:text-foreground">
                        Remove
                      </button>
                    </div> : <label className="block cursor-pointer">
                      <span className="flex aspect-3/4 flex-col items-center justify-center gap-2 border border-dashed border-border bg-[#0F0507]/40 shadow-[inset_0_2px_8px_rgba(0,0,0,0.75),0_12px_20px_-10px_rgba(0,0,0,0.95),0_2px_4px_rgba(0,0,0,0.6)] transition-[border-color,transform] duration-[320ms] hover:border-wine-champagne active:translate-y-px rounded-md">
                        <img src={(type === 'front' ? frontIcon : type === 'back' ? backIcon : type === 'neck' ? neckIcon : fullIcon).url} alt="" className="h-[78%] w-auto object-contain" />
                      </span>
                      <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{label}</span>
                      <input type="file" accept="image/*" capture="environment" onChange={e => handleImageChange(e, type)} className="hidden" />
                    </label>}
                </div>;
            })}
            </div>

            {/* Full width and gold, dimmed until a shot exists rather than
                hidden, so the next step is visible before it is available. */}
            <Button type="button" onClick={processImageWithAI} disabled={aiProcessing || researching || !hasAnyShot} className="mt-6 w-full disabled:opacity-45">
                {aiProcessing ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reading the labels…
                  </> : researching ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scan ready · Performing web research…
                  </> : magicScanCompleted ? (allFourShot ? "All 4 views read · read again" : "Scan ready · read again") : "Magic scan"}
              </Button>
            {!hasAnyShot && <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                Photograph at least one label first
              </p>}
          </div>

          {/* Wine & Virtue Logo - After the section */}
          <div className="flex justify-center my-8">
            <img src={wineVirtueLogo} alt="Wine & Virtue" className="w-48 h-auto opacity-90" />
          </div>

          {/* Form - Only show after Magic Scan is completed */}
          {magicScanCompleted && <form onSubmit={handleSubmit} className="space-y-4">
            <div ref={formRef} className="space-y-4 border border-border bg-card p-6 rounded-md">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold mb-1 text-foreground">Your wine details are ready.</h2>
                <p className="text-sm text-muted-foreground">Verify and press "Add to Cellar" below</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="wine_name" className="text-foreground">Wine Name *</Label>
                <Input id="wine_name" value={formData.wine_name} onChange={e => setFormData({
                ...formData,
                wine_name: e.target.value
              })} required placeholder="Château Margaux" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="producer" className="text-foreground">Producer</Label>
                <Input id="producer" value={formData.producer} onChange={e => setFormData({
                ...formData,
                producer: e.target.value
              })} placeholder="Château Margaux" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vintage_year" className="text-foreground">Vintage</Label>
                  <Input id="vintage_year" type="number" value={formData.vintage_year} onChange={e => setFormData({
                  ...formData,
                  vintage_year: e.target.value
                })} placeholder="2015" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wine_type" className="text-foreground">Type</Label>
                  <Select value={formData.wine_type} onValueChange={value => setFormData({
                  ...formData,
                  wine_type: value
                })}>
                    <SelectTrigger>
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-foreground">Country</Label>
                  <Input id="country" value={formData.country} onChange={e => setFormData({
                  ...formData,
                  country: e.target.value
                })} placeholder="France" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region" className="text-foreground">Region</Label>
                  <Input id="region" value={formData.region} onChange={e => setFormData({
                  ...formData,
                  region: e.target.value
                })} placeholder="Bordeaux" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grape_varietals" className="text-foreground">Main Grape Varietal</Label>
                <Select value={useCustomGrape ? "custom" : formData.grape_varietals} onValueChange={value => {
                if (value === "custom") {
                  setUseCustomGrape(true);
                  setFormData({
                    ...formData,
                    grape_varietals: ""
                  });
                } else {
                  setUseCustomGrape(false);
                  setFormData({
                    ...formData,
                    grape_varietals: value
                  });
                }
              }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grape varietal" />
                  </SelectTrigger>
                  <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                    <SelectItem value="Cabernet Franc">Cabernet Franc</SelectItem>
                    <SelectItem value="Cabernet Sauvignon">Cabernet Sauvignon</SelectItem>
                    <SelectItem value="Chardonnay">Chardonnay</SelectItem>
                    <SelectItem value="Chenin Blanc">Chenin Blanc</SelectItem>
                    <SelectItem value="Grenache">Grenache</SelectItem>
                    <SelectItem value="Malbec">Malbec</SelectItem>
                    <SelectItem value="Merlot">Merlot</SelectItem>
                    <SelectItem value="Nebbiolo">Nebbiolo</SelectItem>
                    <SelectItem value="Pinot Grigio/Gris">Pinot Grigio/Gris</SelectItem>
                    <SelectItem value="Pinot Noir">Pinot Noir</SelectItem>
                    <SelectItem value="Riesling">Riesling</SelectItem>
                    <SelectItem value="Sangiovese">Sangiovese</SelectItem>
                    <SelectItem value="Sauvignon Blanc">Sauvignon Blanc</SelectItem>
                    <SelectItem value="Syrah/Shiraz">Syrah/Shiraz</SelectItem>
                    <SelectItem value="Tempranillo">Tempranillo</SelectItem>
                    <SelectItem value="Viognier">Viognier</SelectItem>
                    <SelectItem value="Zinfandel">Zinfandel</SelectItem>
                    <SelectItem value="custom">+ Add Custom Varietal</SelectItem>
                  </SelectContent>
                </Select>
                {useCustomGrape && <Input id="grape_varietals_custom" autoFocus value={formData.grape_varietals} onChange={e => setFormData({
                ...formData,
                grape_varietals: e.target.value
              })} placeholder="Enter custom grape varietal" className="mt-2" />}
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom_grape_varietals" className="text-foreground">Additional Grapes (Optional)</Label>
                <Input id="custom_grape_varietals" value={formData.custom_grape_varietals} onChange={e => setFormData({
                ...formData,
                custom_grape_varietals: e.target.value
              })} placeholder="e.g., Petit Verdot, Mourvèdre" />
                <p className="text-xs text-muted-foreground">Separate multiple grapes with commas</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-foreground">Description</Label>
                <Textarea id="description" value={formData.description} onChange={e => setFormData({
                ...formData,
                description: e.target.value
              })} placeholder="Wine description (auto-filled by AI scan)" rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain_description" className="text-foreground">Domaine</Label>
                <Textarea id="domain_description" value={formData.domain_description} onChange={e => setFormData({
                ...formData,
                domain_description: e.target.value
              })} placeholder="About the estate (auto-filled by web research)" rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-foreground">Notes</Label>
                <Textarea id="notes" value={formData.notes} onChange={e => setFormData({
                ...formData,
                notes: e.target.value
              })} placeholder="Add personal notes about this wine..." rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alcohol_content" className="text-foreground">ABV %</Label>
                <Input id="alcohol_content" type="number" step="0.1" value={formData.alcohol_content} onChange={e => setFormData({
                ...formData,
                alcohol_content: e.target.value
              })} placeholder="13.5" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price_per_bottle" className="text-foreground">Price ($)</Label>
                <Input id="price_per_bottle" type="number" step="0.01" value={formData.price_per_bottle} onChange={e => setFormData({
                ...formData,
                price_per_bottle: e.target.value
              })} placeholder="50.00" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Storage Locations *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setStorageLocations([...storageLocations, {
                  location: "",
                  rack: "",
                  quantity: "1"
                }])} className="text-xs transition-all">
                    + Add Location
                  </Button>
                </div>
                {storageLocations.map((storage, index) => <div key={index} className="grid grid-cols-[1fr,100px,auto] gap-2 items-end">
                    <div className="space-y-2">
                      <Label htmlFor={`location_${index}`} className="text-foreground text-sm">Location</Label>
                      {savedLocations.length > 0 ? <Select value={customLoc[index] ? "custom" : storage.location} onValueChange={value => {
                    const newLocations = [...storageLocations];
                    if (value === "custom") {
                      newLocations[index].location = "";
                      setCustomLoc(c => ({ ...c, [index]: true }));
                    } else {
                      newLocations[index].location = value;
                      setCustomLoc(c => ({ ...c, [index]: false }));
                    }
                    setStorageLocations(newLocations);
                  }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                            {savedLocations.map(location => <SelectItem key={location} value={location}>
                                {location}
                              </SelectItem>)}
                            <SelectItem value="custom">+ New Location</SelectItem>
                          </SelectContent>
                        </Select> : null}
                      {(savedLocations.length === 0 || customLoc[index]) && <Input id={`location_${index}`} value={storage.location} onChange={e => {
                    const newLocations = [...storageLocations];
                    newLocations[index].location = e.target.value;
                    setStorageLocations(newLocations);
                  }} placeholder="e.g., EuroCave" className={savedLocations.length > 0 ? "mt-2" : ""} required />}
                      <Input id={`rack_${index}`} aria-label="Rack or shelf" value={storage.rack} onChange={e => {
                    const newLocations = [...storageLocations];
                    newLocations[index] = { ...newLocations[index], rack: e.target.value };
                    setStorageLocations(newLocations);
                  }} placeholder="Rack / shelf (optional), e.g., Shelf 3" className="mt-2" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`quantity_${index}`} className="text-foreground text-sm">Qty</Label>
                      <Input id={`quantity_${index}`} type="number" inputMode="numeric" min="1" value={storage.quantity} onChange={e => {
                    const newLocations = [...storageLocations];
                    newLocations[index] = {
                      ...newLocations[index],
                      quantity: e.target.value.replace(/[^0-9]/g, "")
                    };
                    setStorageLocations(newLocations);
                  }} onBlur={() => {
                    const newLocations = [...storageLocations];
                    const parsed = parseInt(newLocations[index].quantity, 10);
                    newLocations[index] = {
                      ...newLocations[index],
                      quantity: String(!parsed || parsed < 1 ? 1 : parsed)
                    };
                    setStorageLocations(newLocations);
                  }} required />
                    </div>
                    {storageLocations.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => {
                  const newLocations = storageLocations.filter((_, i) => i !== index);
                  setStorageLocations(newLocations);
                }} className="text-destructive hover:text-destructive">
                        <X className="h-4 w-4" />
                      </Button>}
                  </div>)}
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 transition-all" disabled={loading}>
              {loading ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Wine...
                </> : "Add to Cellar"}
            </Button>
          </form>}
        </div>
      </div>
    </Layout>;
};
export default AddWine;