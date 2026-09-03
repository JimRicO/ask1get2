import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractWineData, processWineImages } from "@/lib/wine-ai.functions";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrapeList } from "@/lib/normalizeGrape";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Loader2, Wine, X } from "lucide-react";
import uploadButtonImg from "@/assets/upload-button.png";
import bottleIcon from "@/assets/bottle-icon.png";
import neckButtonImg from "@/assets/neck-button.png";
import frontLabelButtonImg from "@/assets/front-label-button.png";
import fullBottleButtonImg from "@/assets/full-bottle-button.png";
import backLabelButtonImg from "@/assets/back-label-button.png";
import wineVirtueLogo from "@/assets/wine-virtue-logo.png";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { validateWineData } from "@/lib/wineValidation";
const AddWine = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const extractWineDataFn = useServerFn(extractWineData);
  const processWineImagesFn = useServerFn(processWineImages);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [magicScanCompleted, setMagicScanCompleted] = useState(false);
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
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
    notes: ""
  });
  const [useCustomGrape, setUseCustomGrape] = useState(false);
  const [storageLocations, setStorageLocations] = useState<Array<{
    location: string;
    quantity: string;
  }>>([{
    location: "",
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
        const allLocations = data.flatMap(w => {
          if (Array.isArray(w.storage_locations)) {
            return w.storage_locations.map((loc: any) => loc.location);
          }
          return [];
        });
        const uniqueLocations = [...new Set(allLocations.filter(Boolean))] as string[];
        setSavedLocations(uniqueLocations);
      }
    };
    fetchLocations();
  }, [session]);
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back' | 'neck' | 'overall') => {
    const rawFile = e.target.files?.[0];
    if (rawFile) {
      // Bake EXIF orientation in and force portrait so bottles are never sideways.
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
      };
      reader.readAsDataURL(file);
    }
  };

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
    }
  };
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
      for (const [type, file] of Object.entries(images)) {
        if (file) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${session.user.id}/${type}_${Date.now()}.${fileExt}`;
          const {
            error: uploadError
          } = await supabase.storage.from("wine-images").upload(fileName, file);
          if (uploadError) throw uploadError;
          const {
            data: {
              publicUrl
            }
          } = supabase.storage.from("wine-images").getPublicUrl(fileName);
          imageUrls[type] = publicUrl;
        }
      }
      const allGrapes = normalizeGrapeList([formData.grape_varietals, ...(formData.custom_grape_varietals ? formData.custom_grape_varietals.split(',') : [])]);

      // Coerce typed quantities to valid numbers (minimum 1)
      const normalizedLocations = storageLocations.map(loc => ({
        location: loc.location,
        quantity: Math.max(1, parseInt(loc.quantity, 10) || 1)
      }));

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
        notes: formData.notes || null
      };
      let wineId: string | null = null;
      if (updateExisting && existingWine) {
        // Merge new images with existing ones
        const mergedImages = {
          ...(existingWine.images || {}),
          ...imageUrls
        };

        // Merge storage locations
        const existingLocations = (existingWine.storage_locations || []) as Array<{
          location: string;
          quantity: number;
        }>;
        const newLocations = [...normalizedLocations];

        // Merge locations: add quantities for same location, append new locations
        const mergedLocations = [...existingLocations];
        newLocations.forEach(newLoc => {
          const existingIndex = mergedLocations.findIndex(loc => loc.location === newLoc.location);
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
          description: formData.description || existingWine.description
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
        wineId = existingWine.id;
        toast.success("Wine updated with new photos and details!");
      } else {
        const {
          data,
          error
        } = await supabase.from("wines").insert(wineData).select();
        if (error) throw error;
        wineId = data?.[0]?.id;
        toast.success("Wine added to your cellar!");
      }

      // Navigate immediately to cellar
      navigate("/cellar");

      // Start background image processing if we have images and a wine ID
      if (wineId && Object.keys(imageUrls).length > 0) {
        processWineImagesFn({
          data: {
            wineId,
            imageUrls
          }
        }).catch(error => {
          console.error("Background processing error:", error);
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to add wine");
    } finally {
      setLoading(false);
    }
  };
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
          }} className="w-full hover:scale-105 active:scale-95 transition-all">
              Create New Entry
            </AlertDialogAction>
            <AlertDialogAction onClick={() => {
            setShowDuplicateDialog(false);
            submitWine(true);
          }} className="w-full hover:scale-105 active:scale-95 transition-all">
              Add Photos to Existing
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0 hover:scale-105 active:scale-95 transition-all">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-[#211111] pb-8">
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Add your bottle</h1>
          <p className="text-white/90">Snap a photo to fill details automatically.</p>
        </div>

        <div className="px-4 mt-6">
          {/* Image Upload */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant mb-6 border border-border/50">
            <Label className="text-base font-serif font-semibold mb-4 block text-white">Take a picture of your wine labels </Label>
            
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              {(['front', 'back', 'neck', 'overall'] as const).map((type, index) => <div key={type}>
                  {imagePreviews[type] ? <div className="relative group">
                      <img src={imagePreviews[type]!} alt={`${type} view`} className="w-full h-40 object-cover rounded-xl border-2 border-white/20" />
                      <button type="button" onClick={() => {
                  setImages(prev => ({
                    ...prev,
                    [type]: null
                  }));
                  setImagePreviews(prev => ({
                    ...prev,
                    [type]: null
                  }));
                }} className="absolute top-2 right-2 bg-background/90 hover:bg-background rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-xs font-medium capitalize">
                        {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : `${type} bottle`}
                      </div>
                    </div> : <label className="relative flex flex-col items-center justify-center h-32 w-32 cursor-pointer overflow-hidden rounded-xl shadow-wine hover:shadow-glow transition-all duration-300 hover:scale-110 active:scale-95">
                      <img src={type === 'neck' ? neckButtonImg : type === 'front' ? frontLabelButtonImg : type === 'back' ? backLabelButtonImg : type === 'overall' ? fullBottleButtonImg : uploadButtonImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="relative z-10 flex flex-col items-center justify-end h-full pb-4 drop-shadow-md">
                        <Camera className="h-8 w-8 text-white/70 mb-2" />
                        <span className="text-xs font-medium capitalize text-white">
                          {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : type === 'neck' ? 'Neck' : type === 'overall' ? 'Full bottle' : `${type} bottle`}
                        </span>
                      </div>
                      <input type="file" accept="image/*" capture="environment" onChange={e => handleImageChange(e, type)} className="hidden" />
                    </label>}
                </div>)}
            </div>

            {(imagePreviews.front || imagePreviews.back || imagePreviews.neck || imagePreviews.overall) && <Button type="button" onClick={processImageWithAI} disabled={aiProcessing} className="w-1/3 mx-auto mt-4 bg-gradient-primary hover:opacity-90 text-white flex justify-center items-center shadow-wine hover:scale-110 active:scale-95 transition-all">
                {aiProcessing ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  </> : "Magic Scan"}
              </Button>}
          </div>

          {/* Wine & Virtue Logo - After the section */}
          <div className="flex justify-center my-8">
            <img src={wineVirtueLogo} alt="Wine & Virtue" className="w-48 h-auto opacity-90" />
          </div>

          {/* Form - Only show after Magic Scan is completed */}
          {magicScanCompleted && <form onSubmit={handleSubmit} className="space-y-4">
            <div ref={formRef} className="bg-card rounded-2xl p-6 shadow-elegant space-y-4 border border-border/50">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold mb-1 text-white">Your wine details are ready.</h2>
                <p className="text-sm text-white/60">Verify and press "Add to Cellar" below</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="wine_name" className="text-white">Wine Name *</Label>
                <Input id="wine_name" value={formData.wine_name} onChange={e => setFormData({
                ...formData,
                wine_name: e.target.value
              })} required placeholder="Château Margaux" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="producer" className="text-white">Producer</Label>
                <Input id="producer" value={formData.producer} onChange={e => setFormData({
                ...formData,
                producer: e.target.value
              })} placeholder="Château Margaux" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vintage_year" className="text-white">Vintage</Label>
                  <Input id="vintage_year" type="number" value={formData.vintage_year} onChange={e => setFormData({
                  ...formData,
                  vintage_year: e.target.value
                })} placeholder="2015" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wine_type" className="text-white">Type</Label>
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
                  <Label htmlFor="country" className="text-white">Country</Label>
                  <Input id="country" value={formData.country} onChange={e => setFormData({
                  ...formData,
                  country: e.target.value
                })} placeholder="France" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region" className="text-white">Region</Label>
                  <Input id="region" value={formData.region} onChange={e => setFormData({
                  ...formData,
                  region: e.target.value
                })} placeholder="Bordeaux" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grape_varietals" className="text-white">Main Grape Varietal</Label>
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
                <Label htmlFor="custom_grape_varietals" className="text-white">Additional Grapes (Optional)</Label>
                <Input id="custom_grape_varietals" value={formData.custom_grape_varietals} onChange={e => setFormData({
                ...formData,
                custom_grape_varietals: e.target.value
              })} placeholder="e.g., Petit Verdot, Mourvèdre" />
                <p className="text-xs text-white/60">Separate multiple grapes with commas</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-white">Description</Label>
                <Textarea id="description" value={formData.description} onChange={e => setFormData({
                ...formData,
                description: e.target.value
              })} placeholder="Wine description (auto-filled by AI scan)" rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-white">Notes</Label>
                <Textarea id="notes" value={formData.notes} onChange={e => setFormData({
                ...formData,
                notes: e.target.value
              })} placeholder="Add personal notes about this wine..." rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alcohol_content" className="text-white">ABV %</Label>
                <Input id="alcohol_content" type="number" step="0.1" value={formData.alcohol_content} onChange={e => setFormData({
                ...formData,
                alcohol_content: e.target.value
              })} placeholder="13.5" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price_per_bottle" className="text-white">Price ($)</Label>
                <Input id="price_per_bottle" type="number" step="0.01" value={formData.price_per_bottle} onChange={e => setFormData({
                ...formData,
                price_per_bottle: e.target.value
              })} placeholder="50.00" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Storage Locations *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setStorageLocations([...storageLocations, {
                  location: "",
                  quantity: "1"
                }])} className="text-xs hover:scale-110 active:scale-95 transition-all">
                    + Add Location
                  </Button>
                </div>
                {storageLocations.map((storage, index) => <div key={index} className="grid grid-cols-[1fr,100px,auto] gap-2 items-end">
                    <div className="space-y-2">
                      <Label htmlFor={`location_${index}`} className="text-white text-sm">Location</Label>
                      {savedLocations.length > 0 ? <Select value={storage.location} onValueChange={value => {
                    const newLocations = [...storageLocations];
                    if (value === "custom") {
                      newLocations[index].location = "";
                    } else {
                      newLocations[index].location = value;
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
                      {(!storage.location || !savedLocations.includes(storage.location)) && <Input id={`location_${index}`} value={storage.location} onChange={e => {
                    const newLocations = [...storageLocations];
                    newLocations[index].location = e.target.value;
                    setStorageLocations(newLocations);
                  }} placeholder="e.g., Rack A3" className={savedLocations.length > 0 ? "mt-2" : ""} required />}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`quantity_${index}`} className="text-white text-sm">Qty</Label>
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

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 hover:scale-105 active:scale-95 transition-all" disabled={loading}>
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