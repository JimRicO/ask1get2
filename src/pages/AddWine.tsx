import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

const AddWine = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageWithAI = async () => {
    if (!imageFile || !session) return;

    setAiProcessing(true);
    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.readAsDataURL(imageFile);
      
      reader.onloadend = async () => {
        const base64Image = reader.result as string;
        
        // Call edge function for AI processing
        const { data, error } = await supabase.functions.invoke("extract-wine-data", {
          body: { image: base64Image },
        });

        if (error) throw error;

        if (data?.extracted) {
          // Update form with extracted data
          setFormData(prev => ({
            ...prev,
            ...data.extracted,
          }));
          toast.success("Wine label scanned successfully!");
        }
      };
    } catch (error: any) {
      console.error("AI processing error:", error);
      toast.error("Failed to process image. You can still add wine manually.");
    } finally {
      setAiProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setLoading(true);
    try {
      let imageUrl = null;

      // Upload image if present
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("wine-images")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("wine-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Insert wine record
      const wineData: any = {
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
        images: imageUrl ? { primary: imageUrl } : null,
      };

      const { error } = await supabase.from("wines").insert(wineData);

      if (error) throw error;

      toast.success("Wine added to your cellar!");
      navigate("/cellar");
    } catch (error: any) {
      toast.error(error.message || "Failed to add wine");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-background to-wine-cream pb-8">
        <div className="bg-primary text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Add Wine</h1>
          <p className="text-primary-foreground/80">Expand your collection</p>
        </div>

        <div className="px-4 mt-6">
          {/* Image Upload */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant mb-6">
            <Label className="text-base font-semibold mb-3 block">Wine Photo</Label>
            
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Wine preview"
                  className="w-full h-64 object-cover rounded-xl mb-4"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={processImageWithAI}
                  disabled={aiProcessing}
                  className="w-full"
                >
                  {aiProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning Label...
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-4 w-4" />
                      Scan Wine Label with AI
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Tap to upload wine photo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-card rounded-2xl p-6 shadow-elegant space-y-4">
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
                  <Input
                    id="storage_location"
                    value={formData.storage_location}
                    onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
                    placeholder="Rack A3"
                  />
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
