import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Loader2, Wine as WineIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const AddWine = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
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
    overall: null,
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
    overall: null,
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
    notes: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch saved locations
  useEffect(() => {
    const fetchLocations = async () => {
      if (!session) return;
      
      const { data } = await supabase
        .from("wines")
        .select("storage_location")
        .eq("user_id", session.user.id)
        .not("storage_location", "is", null);
      
      if (data) {
        const uniqueLocations = [...new Set(data.map(w => w.storage_location).filter(Boolean))] as string[];
        setSavedLocations(uniqueLocations);
      }
    };
    
    fetchLocations();
  }, [session]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back' | 'neck' | 'overall') => {
    const file = e.target.files?.[0];
    if (file) {
      setImages(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [type]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageWithAI = async () => {
    if (!session) return;

    // Collect all available images
    const availableImages = Object.entries(images)
      .filter(([_, file]) => file !== null)
      .map(([type, file]) => ({ type, file: file! }));

    if (availableImages.length === 0) return;

    setAiProcessing(true);
    try {
      const imagePromises = availableImages.map(({ type, file }) => {
        return new Promise<{ type: string; base64: string }>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({ type, base64: reader.result as string });
          };
          reader.readAsDataURL(file);
        });
      });

      const processedImages = await Promise.all(imagePromises);
      
      const { data, error } = await supabase.functions.invoke("extract-wine-data", {
        body: { 
          images: processedImages.map(img => ({
            type: img.type,
            data: img.base64
          }))
        },
      });

      if (error) throw error;

      if (data?.extracted) {
        setFormData(prev => ({
          ...prev,
          ...data.extracted,
        }));
        toast.success("Wine labels scanned successfully!");
        
        // Scroll to the form
        setTimeout(() => {
          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    } catch (error: any) {
      console.error("AI processing error:", error);
      toast.error("Failed to process images. You can still add wine manually.");
    } finally {
      setAiProcessing(false);
    }
  };

  const checkForDuplicates = async () => {
    if (!session || !formData.wine_name) return null;

    // Normalize the wine name for comparison (lowercase, trim whitespace)
    const normalizedSearchName = formData.wine_name.toLowerCase().trim();

    const { data: allWines } = await supabase
      .from("wines")
      .select("*")
      .eq("user_id", session.user.id);

    // Find wines with matching normalized names
    const duplicate = allWines?.find(wine => 
      wine.wine_name.toLowerCase().trim() === normalizedSearchName
    );

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

    setLoading(true);
    try {
      const imageUrls: any = {};

      // Upload all images
      for (const [type, file] of Object.entries(images)) {
        if (file) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${session.user.id}/${type}_${Date.now()}.${fileExt}`;
          
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

      const allGrapes = [
        formData.grape_varietals,
        ...(formData.custom_grape_varietals 
          ? formData.custom_grape_varietals.split(',').map(g => g.trim()) 
          : [])
      ].filter(g => g);

      const wineData: any = {
        user_id: session.user.id,
        wine_name: formData.wine_name,
        producer: formData.producer || null,
        vintage_year: formData.vintage_year ? parseInt(formData.vintage_year) : null,
        wine_type: formData.wine_type || null,
        country: formData.country || null,
        region: formData.region || null,
        alcohol_content: formData.alcohol_content ? parseFloat(formData.alcohol_content) : null,
        current_stock: parseInt(formData.current_stock),
        price_per_bottle: formData.price_per_bottle ? parseFloat(formData.price_per_bottle) : null,
        storage_location: formData.storage_location || null,
        grape_varietals: allGrapes.length > 0 ? allGrapes : null,
        images: Object.keys(imageUrls).length > 0 ? imageUrls : null,
        description: formData.description || null,
        notes: formData.notes || null,
      };

      if (updateExisting && existingWine) {
        // Merge new images with existing ones
        const mergedImages = {
          ...(existingWine.images || {}),
          ...imageUrls
        };
        
        const { error } = await supabase
          .from("wines")
          .update({ 
            images: mergedImages,
            current_stock: existingWine.current_stock + parseInt(formData.current_stock)
          })
          .eq("id", existingWine.id);

        if (error) throw error;
        toast.success("Wine updated with new photos!");
      } else {
        const { error } = await supabase.from("wines").insert(wineData);

        if (error) throw error;
        toast.success("Wine added to your cellar!");
      }

      navigate("/cellar");
    } catch (error: any) {
      toast.error(error.message || "Failed to add wine");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wine Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              "{formData.wine_name}" is already in your cellar. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateDialog(false);
                submitWine(false);
              }}
              className="w-full"
            >
              Create New Entry
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateDialog(false);
                submitWine(true);
              }}
              className="w-full"
            >
              Add Photos to Existing
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-[#211111] pb-8">
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Add Wine</h1>
          <p className="text-primary-foreground/80">Expand your collection</p>
        </div>

        <div className="px-4 mt-6">
          {/* Image Upload */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant mb-6">
            <Label className="text-base font-semibold mb-4 block">Wine Photos</Label>
            
            <div className="grid grid-cols-2 gap-4">
              {(['front', 'back', 'neck', 'overall'] as const).map((type, index) => (
                <div key={type}>
                  {imagePreviews[type] ? (
                    <div className="relative group">
                      <img
                        src={imagePreviews[type]!}
                        alt={`${type} view`}
                        className="w-full h-40 object-cover rounded-xl border-2 border-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImages(prev => ({ ...prev, [type]: null }));
                          setImagePreviews(prev => ({ ...prev, [type]: null }));
                        }}
                        className="absolute top-2 right-2 bg-background/90 hover:bg-background rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-xs font-medium capitalize">
                        {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : `${type} bottle`}
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                      {type === 'overall' ? (
                        <Camera className="h-10 w-10 text-primary/60 mb-2" />
                      ) : (
                        <WineIcon className="h-10 w-10 text-primary/60 mb-2" />
                      )}
                      <span className="text-sm font-medium capitalize text-foreground/80">
                        {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : `${type} bottle`}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleImageChange(e, type)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>

            {(imagePreviews.front || imagePreviews.back || imagePreviews.neck || imagePreviews.overall) && (
              <Button
                type="button"
                onClick={processImageWithAI}
                disabled={aiProcessing}
                className="w-1/3 mx-auto mt-4 bg-primary hover:bg-primary/90 text-white flex justify-center items-center"
              >
                {aiProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning Photos...
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" />
                    Magic Picture Scan
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div ref={formRef} className="bg-card rounded-2xl p-6 shadow-elegant space-y-4">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-1">Your wine details are ready.</h2>
                <p className="text-sm text-muted-foreground">Verify and press "Add to Cellar" below</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="wine_name">Wine Name *</Label>
                <Input
                  id="wine_name"
                  value={formData.wine_name}
                  onChange={(e) => setFormData({ ...formData, wine_name: e.target.value })}
                  required
                  placeholder="Château Margaux"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="producer">Producer</Label>
                <Input
                  id="producer"
                  value={formData.producer}
                  onChange={(e) => setFormData({ ...formData, producer: e.target.value })}
                  placeholder="Château Margaux"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vintage_year">Vintage</Label>
                  <Input
                    id="vintage_year"
                    type="number"
                    value={formData.vintage_year}
                    onChange={(e) => setFormData({ ...formData, vintage_year: e.target.value })}
                    placeholder="2015"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wine_type">Type</Label>
                  <Select
                    value={formData.wine_type}
                    onValueChange={(value) => setFormData({ ...formData, wine_type: value })}
                  >
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
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="France"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="Bordeaux"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grape_varietals">Main Grape Varietal</Label>
                <Select
                  value={formData.grape_varietals}
                  onValueChange={(value) => setFormData({ ...formData, grape_varietals: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select grape varietal" />
                  </SelectTrigger>
                  <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                    <SelectItem value="Cabernet Sauvignon">Cabernet Sauvignon</SelectItem>
                    <SelectItem value="Merlot">Merlot</SelectItem>
                    <SelectItem value="Pinot Noir">Pinot Noir</SelectItem>
                    <SelectItem value="Syrah/Shiraz">Syrah/Shiraz</SelectItem>
                    <SelectItem value="Chardonnay">Chardonnay</SelectItem>
                    <SelectItem value="Sauvignon Blanc">Sauvignon Blanc</SelectItem>
                    <SelectItem value="Riesling">Riesling</SelectItem>
                    <SelectItem value="Pinot Grigio/Gris">Pinot Grigio/Gris</SelectItem>
                    <SelectItem value="Malbec">Malbec</SelectItem>
                    <SelectItem value="Zinfandel">Zinfandel</SelectItem>
                    <SelectItem value="Tempranillo">Tempranillo</SelectItem>
                    <SelectItem value="Sangiovese">Sangiovese</SelectItem>
                    <SelectItem value="Nebbiolo">Nebbiolo</SelectItem>
                    <SelectItem value="Grenache">Grenache</SelectItem>
                    <SelectItem value="Cabernet Franc">Cabernet Franc</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom_grape_varietals">Additional Grapes (Optional)</Label>
                <Input
                  id="custom_grape_varietals"
                  value={formData.custom_grape_varietals}
                  onChange={(e) => setFormData({ ...formData, custom_grape_varietals: e.target.value })}
                  placeholder="e.g., Petit Verdot, Mourvèdre"
                />
                <p className="text-xs text-muted-foreground">Separate multiple grapes with commas</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Wine description (auto-filled by AI scan)"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add personal notes about this wine..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="alcohol_content">ABV %</Label>
                  <Input
                    id="alcohol_content"
                    type="number"
                    step="0.1"
                    value={formData.alcohol_content}
                    onChange={(e) => setFormData({ ...formData, alcohol_content: e.target.value })}
                    placeholder="13.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current_stock">Bottles</Label>
                  <Input
                    id="current_stock"
                    type="number"
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                    required
                    min="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price_per_bottle">Price ($)</Label>
                  <Input
                    id="price_per_bottle"
                    type="number"
                    step="0.01"
                    value={formData.price_per_bottle}
                    onChange={(e) => setFormData({ ...formData, price_per_bottle: e.target.value })}
                    placeholder="50.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage_location">Location</Label>
                  {savedLocations.length > 0 ? (
                    <Select
                      value={formData.storage_location}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          setFormData({ ...formData, storage_location: "" });
                        } else {
                          setFormData({ ...formData, storage_location: value });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select or enter location" />
                      </SelectTrigger>
                      <SelectContent className="bg-background" side="bottom" position="popper" sideOffset={4}>
                        {savedLocations.map((location) => (
                          <SelectItem key={location} value={location}>
                            {location}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">+ Add New Location</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {(!formData.storage_location || !savedLocations.includes(formData.storage_location)) && (
                    <Input
                      id="storage_location"
                      value={formData.storage_location}
                      onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
                      placeholder="e.g., Rack A3, Wine Cellar"
                      className={savedLocations.length > 0 ? "mt-2" : ""}
                    />
                  )}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 h-12"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Wine...
                </>
              ) : (
                "Add to Cellar"
              )}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default AddWine;
