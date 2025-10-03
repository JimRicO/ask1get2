import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wine, MapPin, Calendar, Percent, DollarSign, Edit, Trash2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

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
  ai_tasting_notes: string | null;
  ai_food_pairings: string[] | null;
  optimal_drinking_window: string | null;
  grape_varietals: any;
  images: any;
  created_at: string;
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
  const { id } = useParams();
  const navigate = useNavigate();
  const [wine, setWine] = useState<WineData | null>(null);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [editStockDialogOpen, setEditStockDialogOpen] = useState(false);
  const [newStock, setNewStock] = useState(0);
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState("");
  const [occasion, setOccasion] = useState("");
  const [foodPairing, setFoodPairing] = useState("");
  const [processingBackground, setProcessingBackground] = useState(false);
  
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 3000, stopOnInteraction: false })
  ]);

  useEffect(() => {
    if (id) {
      fetchWine();
      fetchTastingNotes();
    }
  }, [id]);

  const fetchWine = async () => {
    try {
      const { data, error } = await supabase
        .from("wines")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setWine(data);
    } catch (error: any) {
      toast.error("Failed to load wine details");
      navigate("/cellar");
    } finally {
      setLoading(false);
    }
  };

  const fetchTastingNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("tasting_notes")
        .select("*")
        .eq("wine_id", id)
        .order("tasting_date", { ascending: false });

      if (error) throw error;
      setTastingNotes(data || []);
    } catch (error) {
      console.error("Failed to fetch tasting notes:", error);
    }
  };

  const handleConsume = async () => {
    if (!wine) return;

    try {
      // Add tasting note
      const { error: noteError } = await supabase.from("tasting_notes").insert({
        wine_id: wine.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        rating,
        notes: notes || null,
        occasion: occasion || null,
        food_pairing: foodPairing || null,
      });

      if (noteError) throw noteError;

      // Update stock
      const newStock = Math.max(0, wine.current_stock - 1);
      const { error: updateError } = await supabase
        .from("wines")
        .update({ current_stock: newStock })
        .eq("id", wine.id);

      if (updateError) throw updateError;

      toast.success("Tasting note added!");
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
      const { error } = await supabase.from("wines").delete().eq("id", wine.id);
      if (error) throw error;
      toast.success("Wine deleted");
      navigate("/cellar");
    } catch (error: any) {
      toast.error("Failed to delete wine");
    }
  };

  const handleUpdateStock = async () => {
    if (!wine) return;

    try {
      const { error } = await supabase
        .from("wines")
        .update({ current_stock: newStock })
        .eq("id", wine.id);

      if (error) throw error;

      toast.success("Stock updated!");
      setEditStockDialogOpen(false);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to update stock");
    }
  };

  const handleRemoveBackground = async () => {
    if (!wine || !wine.images) return;

    setProcessingBackground(true);
    const session = await supabase.auth.getSession();
    
    try {
      const processedImages: any = {};
      const imageEntries = Object.entries(wine.images);
      
      toast.info(`Processing ${imageEntries.length} image(s)...`);

      for (const [type, url] of imageEntries) {
        console.log(`Processing ${type} image...`);
        
        // Call edge function to process image
        const { data, error } = await supabase.functions.invoke('remove-wine-background', {
          body: { imageUrl: url }
        });

        if (error) {
          console.error(`Error processing ${type}:`, error);
          toast.error(`Failed to process ${type} image`);
          continue;
        }

        if (!data.processedImage) {
          console.error(`No processed image for ${type}`);
          continue;
        }

        // Convert base64 to blob
        const base64Data = data.processedImage.split(',')[1];
        const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob());

        // Upload to storage
        const fileName = `${session.data.session?.user.id}/${type}_cleaned_${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('wine-images')
          .upload(fileName, blob);

        if (uploadError) {
          console.error(`Upload error for ${type}:`, uploadError);
          toast.error(`Failed to upload ${type} image`);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('wine-images')
          .getPublicUrl(fileName);

        processedImages[type] = publicUrl;
        toast.success(`${type} image cleaned!`);
      }

      // Update wine record with new images
      if (Object.keys(processedImages).length > 0) {
        const { error: updateError } = await supabase
          .from('wines')
          .update({ images: processedImages })
          .eq('id', wine.id);

        if (updateError) throw updateError;

        toast.success('All images updated with clean backgrounds!');
        fetchWine();
      } else {
        toast.error('No images were successfully processed');
      }
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error(error.message || 'Failed to clean backgrounds');
    } finally {
      setProcessingBackground(false);
    }
  };

  if (loading || !wine) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-[#1a1410]">
        {/* Header */}
        <div className="bg-[#1a1410] text-white px-4 py-4 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/cellar")}
            className="text-white hover:text-white/80 p-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold ml-4">Wine Details</h1>
        </div>

        <div className="px-4 pb-20">
          {/* Wine Bottle Image Carousel */}
          <div className="bg-[#d4c4a8] rounded-3xl overflow-hidden mt-4" style={{ minHeight: '280px' }}>
            {wine.images && typeof wine.images === 'object' && Object.keys(wine.images).length > 0 ? (
              <div className="embla" ref={emblaRef}>
                <div className="embla__container flex">
                  {Object.entries(wine.images).map(([type, url]: [string, any]) => (
                    <div key={type} className="embla__slide flex-[0_0_100%] min-w-0 flex items-center justify-center p-8">
                      <img
                        src={url}
                        alt={`${type} view`}
                        className="h-64 w-auto object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <Wine className="h-32 w-32 text-black/20" />
              </div>
            )}
          </div>

          {/* Clean Background Button */}
          {wine.images && typeof wine.images === 'object' && Object.keys(wine.images).length > 0 && (
            <Button
              onClick={handleRemoveBackground}
              disabled={processingBackground}
              className="w-full mt-4 bg-primary hover:bg-primary/90"
            >
              {processingBackground ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  Processing Images...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Clean Background with AI
                </>
              )}
            </Button>
          )}

          {/* Wine Name */}
          <div className="mt-6">
            <h2 className="text-2xl font-bold text-white">{wine.wine_name} {wine.vintage_year || ''}</h2>
            {(wine.country || wine.region) && (
              <p className="text-gray-400 mt-1 text-sm">
                {wine.region && wine.country ? `${wine.region}, ${wine.country}` : wine.region || wine.country}
              </p>
            )}
          </div>

          {/* Tasting Notes */}
          {tastingNotes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-white font-semibold mb-2">Tasting Notes</h3>
              <div className="space-y-3">
                {tastingNotes.map((note) => (
                  <div key={note.id} className="text-gray-300 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        {new Date(note.tasting_date).toLocaleDateString()}
                      </span>
                      <div className="text-yellow-500">
                        {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                      </div>
                    </div>
                    {note.notes && <p>{note.notes}</p>}
                    {note.occasion && <p className="text-xs text-gray-500 mt-1">Occasion: {note.occasion}</p>}
                    {note.food_pairing && <p className="text-xs text-gray-500">Paired with: {note.food_pairing}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase Details */}
          <div className="mt-6">
            <h3 className="text-white font-semibold mb-3">Purchase Details</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Purchase Date</span>
                <span className="text-white">{new Date(wine.created_at).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
              </div>
              {wine.price_per_bottle && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Price</span>
                  <span className="text-white">${wine.price_per_bottle.toFixed(0)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Quantity</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{wine.current_stock}</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setNewStock(wine.current_stock);
                      setEditStockDialogOpen(true);
                    }}
                    className="h-5 w-5 p-0 text-gray-400 hover:text-white"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {wine.storage_location && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Location</span>
                  <span className="text-white">{wine.storage_location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-8">
            <Dialog open={consumeDialogOpen} onOpenChange={setConsumeDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#5c2e2e] hover:bg-[#4a2424] text-white border-0 rounded-lg py-6">
                  Log Tasting
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1410] text-white border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Log Tasting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-white">Rating</Label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className="text-2xl text-yellow-500"
                        >
                          {star <= rating ? "★" : "☆"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Tasting Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Describe the flavors, aromas..."
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Occasion</Label>
                    <Input
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      placeholder="Dinner party, celebration..."
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Food Pairing</Label>
                    <Input
                      value={foodPairing}
                      onChange={(e) => setFoodPairing(e.target.value)}
                      placeholder="What did you pair it with?"
                      className="bg-[#2a2420] border-gray-700 text-white"
                    />
                  </div>
                  <Button onClick={handleConsume} className="w-full bg-[#5c2e2e] hover:bg-[#4a2424]">
                    Save Tasting Note
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button 
              variant="destructive" 
              onClick={handleDelete}
              className="bg-[#dc2626] hover:bg-[#b91c1c] text-white border-0 rounded-lg py-6"
            >
              Delete
            </Button>
          </div>

          {/* Stock Edit Dialog */}
          <Dialog open={editStockDialogOpen} onOpenChange={setEditStockDialogOpen}>
            <DialogContent className="bg-[#1a1410] text-white border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Update Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-white">Number of Bottles</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newStock}
                    onChange={(e) => setNewStock(parseInt(e.target.value) || 0)}
                    className="bg-[#2a2420] border-gray-700 text-white"
                  />
                </div>
                <Button onClick={handleUpdateStock} className="w-full bg-[#5c2e2e] hover:bg-[#4a2424]">
                  Update Stock
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Layout>
  );
};

export default WineDetail;
