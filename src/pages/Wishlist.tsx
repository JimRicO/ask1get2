import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractWineData } from "@/lib/wine-ai.functions";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrapeList } from "@/lib/normalizeGrape";
import { normalizeImageOrientation } from "@/lib/normalizeImageOrientation";


import Layout from "@/components/Layout";
import { Heart, Camera, Trash2, Loader2, Edit, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import uploadButtonImg from "@/assets/upload-button.png";
import bottleIcon from "@/assets/bottle-icon.png";
import neckButtonImg from "@/assets/neck-button.png";
import frontLabelButtonImg from "@/assets/front-label-button.png";
import fullBottleButtonImg from "@/assets/full-bottle-button.png";
import backLabelButtonImg from "@/assets/back-label-button.png";

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
      };
      reader.readAsDataURL(file);
    } else {
      setImages(prev => ({ ...prev, [type]: null }));
      setImagePreviews(prev => ({ ...prev, [type]: null }));
    }
  };


  const processImageWithAI = async () => {
    if (!Object.values(images).some(img => img !== null)) {
      toast.error("Please upload at least one image");
      return;
    }

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
      toast.success("Wine data extracted successfully!");
      
      // Scroll to form section
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error: any) {
      toast.error("Failed to analyze images");
      console.error(error);
    } finally {
      setAiProcessing(false);
    }
  };

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
      <div className="min-h-screen bg-[#211111]">
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Wishlist</h1>
          <p className="text-primary-foreground/80">Wines you want to try, to remember, to buy</p>
        </div>

        <div className="mt-6 pb-20">
          {/* Add Wine Button */}
          <div className="mb-6 flex justify-center px-4">
            <Button 
              onClick={openAddDialog}
              className="mx-auto bg-primary hover:bg-primary/90"
            >
              <Camera className="h-5 w-5 mr-2" />
              Add a Bottle
            </Button>
          </div>

          {/* Wishlist Items */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            </div>
          ) : wishlistItems.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-white">No wines yet</h3>
              <p className="text-muted-foreground">
                Take a photo of a wine label to add it to your wishlist
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-4">
              {wishlistItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#2a2420] rounded-2xl p-4 flex items-start gap-4 cursor-pointer hover:bg-[#3a3430] transition-colors"
                  onClick={() => {
                    setSelectedItem(item);
                    setDetailDialogOpen(true);
                  }}
                >
                  {/* Wine image */}
                  <div className="bg-[#d4c4a8] rounded-xl w-20 h-20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.images?.front ? (
                      <img
                        src={item.images.front}
                        alt={item.wine_name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-8 w-8 text-[#1a1410]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>';
                        }}
                      />
                    ) : (
                      <Heart className="h-8 w-8 text-[#1a1410]" />
                    )}
                  </div>

                  {/* Wine details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg mb-1">
                      {item.wine_name}
                    </h3>
                    {item.producer && (
                      <p className="text-sm text-white/80 mb-1">{item.producer}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-white/70 mb-2">
                      {item.vintage_year && <span>{item.vintage_year}</span>}
                      {item.wine_type && (
                        <span className="capitalize">{item.wine_type}</span>
                      )}
                      {item.region && <span>{item.region}</span>}
                      {item.country && <span>{item.country}</span>}
                    </div>
                    {item.grape_varietals && (
                      <p className="text-sm text-white/60 mb-2">
                        {item.grape_varietals}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-sm text-white/60 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white/60 hover:text-red-400 hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(item.id, item.wine_name);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#211111] border-[#3a3430]">
          <DialogHeader>
            <DialogTitle className="text-white">Add Wine to Wishlist</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Image Upload Section */}
            <div className="space-y-4">
              <Label className="text-white">Upload Wine Photos</Label>
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
                    <div className="relative aspect-square bg-[#2a2420] rounded-lg overflow-hidden border-2 border-dashed border-gray-700 hover:border-primary/50 transition-colors">
                      {imagePreviews.front ? (
                         <img src={imagePreviews.front} alt="Front" className="w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <img src={frontLabelButtonImg} alt="Front Label" className="w-16 h-16 mb-2" />
                          <span className="text-sm text-gray-400">Front Label</span>
                        </div>
                      )}
                    </div>
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
                    <div className="relative aspect-square bg-[#2a2420] rounded-lg overflow-hidden border-2 border-dashed border-gray-700 hover:border-primary/50 transition-colors">
                      {imagePreviews.back ? (
                         <img src={imagePreviews.back} alt="Back" className="w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <img src={backLabelButtonImg} alt="Back Label" className="w-16 h-16 mb-2" />
                          <span className="text-sm text-gray-400">Back Label</span>
                        </div>
                      )}
                    </div>
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
                    <div className="relative aspect-square bg-[#2a2420] rounded-lg overflow-hidden border-2 border-dashed border-gray-700 hover:border-primary/50 transition-colors">
                      {imagePreviews.neck ? (
                         <img src={imagePreviews.neck} alt="Neck" className="w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <img src={neckButtonImg} alt="Neck" className="w-16 h-16 mb-2" />
                          <span className="text-sm text-gray-400">Neck</span>
                        </div>
                      )}
                    </div>
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
                    <div className="relative aspect-square bg-[#2a2420] rounded-lg overflow-hidden border-2 border-dashed border-gray-700 hover:border-primary/50 transition-colors">
                      {imagePreviews.overall ? (
                         <img src={imagePreviews.overall} alt="Full Bottle" className="w-full h-full object-contain" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <img src={fullBottleButtonImg} alt="Full Bottle" className="w-16 h-16 mb-2" />
                          <span className="text-sm text-gray-400">Full Bottle</span>
                        </div>
                      )}
                    </div>
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

              {/* Magic Scan Button */}
              <Button
                onClick={processImageWithAI}
                disabled={aiProcessing || !Object.values(images).some(img => img !== null)}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {aiProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Analyzing Images...
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5 mr-2" />
                    Magic Scan
                  </>
                )}
              </Button>
            </div>

            {/* Form Fields - Show after Magic Scan */}
            {magicScanCompleted && (
              <div ref={formSectionRef} className="space-y-4 scroll-mt-4">
                <div className="space-y-2">
                  <Label className="text-white">Wine Name *</Label>
                  <Input
                    value={formData.wine_name}
                    onChange={(e) => setFormData({ ...formData, wine_name: e.target.value })}
                    className="bg-[#2a2420] border-gray-700 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white">Producer</Label>
                    <Input
                      value={formData.producer}
                      onChange={(e) => setFormData({ ...formData, producer: e.target.value })}
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Vintage Year</Label>
                    <Input
                      type="number"
                      value={formData.vintage_year}
                      onChange={(e) => setFormData({ ...formData, vintage_year: e.target.value })}
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Wine Type</Label>
                  <Select value={formData.wine_type} onValueChange={(value) => setFormData({ ...formData, wine_type: value })}>
                    <SelectTrigger className="bg-[#2a2420] border-gray-700 text-white">
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
                    <Label className="text-white">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Region</Label>
                    <Input
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Grape Varietals</Label>
                  <Input
                    value={formData.grape_varietals}
                    onChange={(e) => setFormData({ ...formData, grape_varietals: e.target.value })}
                    placeholder="e.g., Cabernet Sauvignon, Merlot"
                    className="bg-[#2a2420] border-gray-700 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-[#2a2420] border-gray-700 text-white min-h-[100px]"
                    placeholder="Wine description from the label..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Personal Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="bg-[#2a2420] border-gray-700 text-white min-h-[100px]"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#211111] border-[#3a3430]">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">{selectedItem?.wine_name}</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              {/* Images Gallery */}
              {selectedItem.images && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.images.front && (
                    <div className="space-y-2">
                      <Label className="text-white/70 text-xs">Front Label</Label>
                      <img
                        src={selectedItem.images.front}
                        alt="Front label"
                        className="w-full rounded-lg border border-gray-700"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.back && (
                    <div className="space-y-2">
                      <Label className="text-white/70 text-xs">Back Label</Label>
                      <img
                        src={selectedItem.images.back}
                        alt="Back label"
                        className="w-full rounded-lg border border-gray-700"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.neck && (
                    <div className="space-y-2">
                      <Label className="text-white/70 text-xs">Neck</Label>
                      <img
                        src={selectedItem.images.neck}
                        alt="Neck"
                        className="w-full rounded-lg border border-gray-700"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {selectedItem.images.overall && (
                    <div className="space-y-2">
                      <Label className="text-white/70 text-xs">Full Bottle</Label>
                      <img
                        src={selectedItem.images.overall}
                        alt="Full bottle"
                        className="w-full rounded-lg border border-gray-700"
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
                    <Label className="text-white/70 text-xs">Producer</Label>
                    <p className="text-white text-lg">{selectedItem.producer}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.vintage_year && (
                    <div>
                      <Label className="text-white/70 text-xs">Vintage</Label>
                      <p className="text-white">{selectedItem.vintage_year}</p>
                    </div>
                  )}
                  {selectedItem.wine_type && (
                    <div>
                      <Label className="text-white/70 text-xs">Type</Label>
                      <p className="text-white capitalize">{selectedItem.wine_type}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.country && (
                    <div>
                      <Label className="text-white/70 text-xs">Country</Label>
                      <p className="text-white">{selectedItem.country}</p>
                    </div>
                  )}
                  {selectedItem.region && (
                    <div>
                      <Label className="text-white/70 text-xs">Region</Label>
                      <p className="text-white">{selectedItem.region}</p>
                    </div>
                  )}
                </div>

                {selectedItem.grape_varietals && (
                  <div>
                    <Label className="text-white/70 text-xs">Grape Varietals</Label>
                    <p className="text-white">{selectedItem.grape_varietals}</p>
                  </div>
                )}

                {selectedItem.description && (
                  <div>
                    <Label className="text-white/70 text-xs">Description</Label>
                    <p className="text-white/90 whitespace-pre-wrap">{selectedItem.description}</p>
                  </div>
                )}

                {selectedItem.notes && (
                  <div>
                    <Label className="text-white/70 text-xs">Personal Notes</Label>
                    <p className="text-white/90 whitespace-pre-wrap">{selectedItem.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-700">
                <Button
                  variant="destructive"
                  onClick={() => {
                    confirmDelete(selectedItem.id, selectedItem.wine_name);
                    setDetailDialogOpen(false);
                  }}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove from Wishlist
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#211111] border-[#3a3430]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove from Wishlist?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              Are you sure you want to remove this wine from your wishlist? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#2a2420] text-white hover:bg-[#3a3430] border-[#3a3430]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
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
