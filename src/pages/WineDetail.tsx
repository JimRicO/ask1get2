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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  description?: string | null;
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

  // Flip card state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

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
  const handleCardClick = () => {
    if (!wine?.images || isFlipping) return;
    const imageCount = Object.keys(wine.images).length;
    if (imageCount <= 1) return;
    setIsFlipping(true);
    setTimeout(() => {
      setCurrentImageIndex(prev => (prev + 1) % imageCount);
      setIsFlipping(false);
    }, 300);
  };
  useEffect(() => {
    if (id) {
      fetchWine();
      fetchTastingNotes();
    }
  }, [id]);
  const fetchWine = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("wines").select("*").eq("id", id).single();
      if (error) throw error;
      setWine(data);

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
      } = await supabase.from("tasting_notes").select("*").eq("wine_id", id).order("tasting_date", {
        ascending: false
      });
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
      const {
        error: noteError
      } = await supabase.from("tasting_notes").insert({
        wine_id: wine.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        rating,
        notes: notes || null,
        occasion: occasion || null,
        food_pairing: foodPairing || null
      });
      if (noteError) throw noteError;

      // Update stock
      const newStock = Math.max(0, wine.current_stock - 1);
      const {
        error: updateError
      } = await supabase.from("wines").update({
        current_stock: newStock
      }).eq("id", wine.id);
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
  const handleUpdateStock = async () => {
    if (!wine) return;
    try {
      const {
        error
      } = await supabase.from("wines").update({
        current_stock: newStock
      }).eq("id", wine.id);
      if (error) throw error;
      toast.success("Stock updated!");
      setEditStockDialogOpen(false);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to update stock");
    }
  };
  const handleUpdateWine = async () => {
    if (!wine) return;
    try {
      const grapeArray = editForm.grape_varietals ? editForm.grape_varietals.split(',').map(g => g.trim()).filter(Boolean) : null;
      const validWineTypes = ['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'];
      const wineType = editForm.wine_type && validWineTypes.includes(editForm.wine_type.toLowerCase()) ? editForm.wine_type.toLowerCase() : null;
      const {
        error
      } = await supabase.from("wines").update({
        wine_name: editForm.wine_name || null,
        producer: editForm.producer || null,
        vintage_year: editForm.vintage_year ? parseInt(editForm.vintage_year) : null,
        wine_type: wineType as any,
        country: editForm.country || null,
        region: editForm.region || null,
        appellation: editForm.appellation || null,
        alcohol_content: editForm.alcohol_content ? parseFloat(editForm.alcohol_content) : null,
        price_per_bottle: editForm.price_per_bottle ? parseFloat(editForm.price_per_bottle) : null,
        storage_location: editForm.storage_location || null,
        notes: editForm.notes || null,
        description: editForm.description || null,
        grape_varietals: grapeArray,
        optimal_drinking_window: editForm.optimal_drinking_window || null
      }).eq("id", wine.id);
      if (error) throw error;
      toast.success("Wine updated!");
      setEditWineDialogOpen(false);
      fetchWine();
    } catch (error: any) {
      toast.error("Failed to update wine");
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
        const {
          data,
          error
        } = await supabase.functions.invoke('remove-wine-background', {
          body: {
            imageUrl: url
          }
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
        const {
          error: uploadError
        } = await supabase.storage.from('wine-images').upload(fileName, blob);
        if (uploadError) {
          console.error(`Upload error for ${type}:`, uploadError);
          toast.error(`Failed to upload ${type} image`);
          continue;
        }
        const {
          data: {
            publicUrl
          }
        } = supabase.storage.from('wine-images').getPublicUrl(fileName);
        processedImages[type] = publicUrl;
        toast.success(`${type} image cleaned!`);
      }

      // Update wine record with new images
      if (Object.keys(processedImages).length > 0) {
        const {
          error: updateError
        } = await supabase.from('wines').update({
          images: processedImages
        }).eq('id', wine.id);
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
    return <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        </div>
      </Layout>;
  }
  return <Layout>
      <div className="min-h-screen bg-[#1a1410]">
        {/* Header */}
        <div className="bg-[#1a1410] text-white px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate("/cellar")} className="text-white hover:text-white/80 p-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold ml-4">Wine Details</h1>
          </div>
        </div>

        <div className="px-4 pb-20">


          {/* Wine Name */}
          <div className="mt-6">
            <h2 className="text-2xl font-bold text-white">{wine.wine_name} {wine.vintage_year || ''}</h2>
            {(wine.country || wine.region) && <p className="text-gray-400 mt-1 text-sm">
                {wine.region && wine.country ? `${wine.region}, ${wine.country}` : wine.region || wine.country}
              </p>}
          </div>

          {/* Wine Information Section */}
          <div className="mt-6 bg-[#2a2420] rounded-xl p-4 space-y-3">
            <h3 className="text-white font-semibold mb-3">Wine Information</h3>
            
            {wine.producer && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Producer</span>
                <span className="text-white text-right">{wine.producer}</span>
              </div>}

            {wine.vintage_year && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Vintage Year</span>
                <span className="text-white">{wine.vintage_year}</span>
              </div>}
            
            {wine.wine_type && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Type</span>
                <span className="text-white capitalize">{wine.wine_type}</span>
              </div>}

            {wine.country && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Country</span>
                <span className="text-white text-right">{wine.country}</span>
              </div>}

            {wine.region && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Region</span>
                <span className="text-white text-right">{wine.region}</span>
              </div>}
            
            {wine.grape_varietals && Array.isArray(wine.grape_varietals) && wine.grape_varietals.length > 0 && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Grape Varietals</span>
                <span className="text-white text-right">
                  {wine.grape_varietals.map((g: any) => typeof g === 'string' ? g : g?.name).filter(Boolean).join(', ')}
                </span>
              </div>}
            
            {wine.appellation && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Appellation</span>
                <span className="text-white text-right">{wine.appellation}</span>
              </div>}
            
            {wine.alcohol_content && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Alcohol Content (ABV)</span>
                <span className="text-white">{wine.alcohol_content}%</span>
              </div>}
            
            {wine.optimal_drinking_window && <div className="flex justify-between text-sm">
                <span className="text-gray-400">Optimal Drinking Window</span>
                <span className="text-white text-right">{wine.optimal_drinking_window}</span>
              </div>}
          </div>

          {/* Description */}
          {wine.description && <div className="mt-6 bg-[#2a2420] rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Description</h3>
              <p className="text-gray-300 text-sm">{wine.description}</p>
            </div>}

          {/* Notes */}
          {wine.notes && <div className="mt-6 bg-[#2a2420] rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Notes</h3>
              <p className="text-gray-300 text-sm">{wine.notes}</p>
            </div>}

          {/* AI Insights */}
          {(wine.ai_tasting_notes || wine.ai_food_pairings && wine.ai_food_pairings.length > 0) && <div className="mt-6 bg-[#2a2420] rounded-xl p-4 space-y-3">
              <h3 className="text-white font-semibold mb-3">AI Insights</h3>
              
              {wine.ai_tasting_notes && <div>
                  <p className="text-gray-400 text-xs mb-1">Tasting Notes</p>
                  <p className="text-white text-sm">{wine.ai_tasting_notes}</p>
                </div>}
              
              {wine.ai_food_pairings && wine.ai_food_pairings.length > 0 && <div>
                  <p className="text-gray-400 text-xs mb-1">Food Pairings</p>
                  <div className="flex flex-wrap gap-2">
                    {wine.ai_food_pairings.map((pairing, index) => <span key={index} className="bg-[#3a3430] text-white text-xs px-2 py-1 rounded">
                        {pairing}
                      </span>)}
                  </div>
                </div>}
            </div>}

          {/* Tasting Notes */}
          {tastingNotes.length > 0 && <div className="mt-6 bg-[#2a2420] rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3">My Tasting Notes</h3>
              <div className="space-y-4">
                {tastingNotes.map(note => <div key={note.id} className="border-b border-gray-700 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        {new Date(note.tasting_date).toLocaleDateString()}
                      </span>
                      <div className="text-yellow-500">
                        {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                      </div>
                    </div>
                    {note.notes && <p className="text-white text-sm mb-2">{note.notes}</p>}
                    {note.occasion && <p className="text-xs text-gray-400">Occasion: {note.occasion}</p>}
                    {note.food_pairing && <p className="text-xs text-gray-400">Paired with: {note.food_pairing}</p>}
                  </div>)}
              </div>
            </div>}

          {/* Purchase Details */}
          <div className="mt-6 bg-[#2a2420] rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Purchase Details</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Purchase Date</span>
                <span className="text-white">{new Date(wine.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                })}</span>
              </div>
              {wine.price_per_bottle && <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Price</span>
                  <span className="text-white">${wine.price_per_bottle.toFixed(0)}</span>
                </div>}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Quantity</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{wine.current_stock}</span>
                  <Button variant="ghost" size="sm" onClick={() => {
                  setNewStock(wine.current_stock);
                  setEditStockDialogOpen(true);
                }} className="h-5 w-5 p-0 text-gray-400 hover:text-white">
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {wine.storage_location && <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Storage Location</span>
                  <span className="text-white">{wine.storage_location}</span>
                </div>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 mt-8">
            <Dialog open={consumeDialogOpen} onOpenChange={setConsumeDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-[#f5f5dc] hover:bg-[#e8e8d0] text-[#1a1410] border-0 rounded-lg py-6">Record your tasting note</Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1410] text-white border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Log Tasting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-white">Rating</Label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(star => <button key={star} type="button" onClick={() => setRating(star)} className="text-2xl text-yellow-500">
                          {star <= rating ? "★" : "☆"}
                        </button>)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Tasting Notes</Label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the flavors, aromas..." className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Occasion</Label>
                    <Input value={occasion} onChange={e => setOccasion(e.target.value)} placeholder="Dinner party, celebration..." className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Food Pairing</Label>
                    <Input value={foodPairing} onChange={e => setFoodPairing(e.target.value)} placeholder="What did you pair it with?" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <Button onClick={handleConsume} className="w-full bg-[#5c2e2e] hover:bg-[#4a2424]">
                    Save Tasting Note
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => setEditWineDialogOpen(true)} className="bg-[#5c2e2e] hover:bg-[#4a2424] text-white border-0 rounded-lg py-6">
                <Edit className="h-5 w-5 mr-2" />
                Edit Wine
              </Button>

              <Button variant="destructive" onClick={handleDelete} className="bg-[#dc2626] hover:bg-[#b91c1c] text-white border-0 rounded-lg py-6">
                Delete
              </Button>
            </div>
          </div>

          {/* Bottle Images Card */}
          <div className="mt-6 bg-[#2a2420] rounded-xl p-6 perspective-1000">
            <h3 className="text-white font-semibold mb-4">Your Bottle Preview</h3>
            {wine.images && typeof wine.images === 'object' && Object.keys(wine.images).length > 0 ? <div className={`relative h-80 cursor-pointer transition-all duration-300 ${isFlipping ? 'animate-flip' : ''}`} onClick={handleCardClick} style={{
            transformStyle: 'preserve-3d'
          }}>
                {Object.entries(wine.images).map(([type, url]: [string, any], index) => <div key={type} className={`absolute inset-0 flex items-center justify-center p-8 transition-opacity duration-300 ${index === currentImageIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <img src={url} alt={`${type} view`} className="h-72 w-auto object-contain" />
                  </div>)}
                {Object.keys(wine.images).length > 1 && <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                    {Object.keys(wine.images).map((_, index) => <div key={index} className={`h-2 w-2 rounded-full transition-all ${index === currentImageIndex ? 'bg-white w-6' : 'bg-white/50'}`} />)}
                  </div>}
              </div> : <div className="flex items-center justify-center h-80 p-8">
                <Wine className="h-32 w-32 text-gray-600/20" />
              </div>}
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
                  <Input type="number" min="0" value={newStock} onChange={e => setNewStock(parseInt(e.target.value) || 0)} className="bg-[#2a2420] border-gray-700 text-white" />
                </div>
                <Button onClick={handleUpdateStock} className="w-full bg-[#5c2e2e] hover:bg-[#4a2424]">
                  Update Stock
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Wine Dialog */}
          <Dialog open={editWineDialogOpen} onOpenChange={setEditWineDialogOpen}>
            <DialogContent className="bg-[#1a1410] text-white border-gray-700 max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="text-white">Edit Wine Details</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-white">Wine Name</Label>
                    <Input value={editForm.wine_name} onChange={e => setEditForm({
                    ...editForm,
                    wine_name: e.target.value
                  })} placeholder="Wine name" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Producer</Label>
                    <Input value={editForm.producer} onChange={e => setEditForm({
                    ...editForm,
                    producer: e.target.value
                  })} placeholder="Producer name" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Vintage Year</Label>
                    <Input type="number" value={editForm.vintage_year} onChange={e => setEditForm({
                    ...editForm,
                    vintage_year: e.target.value
                  })} placeholder="2020" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Wine Type</Label>
                    <Input value={editForm.wine_type} onChange={e => setEditForm({
                    ...editForm,
                    wine_type: e.target.value
                  })} placeholder="Red, White, Rosé, etc." className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Country</Label>
                    <Input value={editForm.country} onChange={e => setEditForm({
                    ...editForm,
                    country: e.target.value
                  })} placeholder="France, Italy, etc." className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Region</Label>
                    <Input value={editForm.region} onChange={e => setEditForm({
                    ...editForm,
                    region: e.target.value
                  })} placeholder="Bordeaux, Tuscany, etc." className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Appellation</Label>
                    <Input value={editForm.appellation} onChange={e => setEditForm({
                    ...editForm,
                    appellation: e.target.value
                  })} placeholder="e.g., Pauillac, Chianti Classico" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Grape Varietals</Label>
                    <Input value={editForm.grape_varietals} onChange={e => setEditForm({
                    ...editForm,
                    grape_varietals: e.target.value
                  })} placeholder="e.g., Cabernet Sauvignon, Merlot" className="bg-[#2a2420] border-gray-700 text-white" />
                    <p className="text-xs text-gray-400">Separate multiple grapes with commas</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Alcohol Content (%)</Label>
                    <Input type="number" step="0.1" value={editForm.alcohol_content} onChange={e => setEditForm({
                    ...editForm,
                    alcohol_content: e.target.value
                  })} placeholder="13.5" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Price ($)</Label>
                    <Input type="number" step="0.01" value={editForm.price_per_bottle} onChange={e => setEditForm({
                    ...editForm,
                    price_per_bottle: e.target.value
                  })} placeholder="50.00" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Storage Location</Label>
                    <Input value={editForm.storage_location} onChange={e => setEditForm({
                    ...editForm,
                    storage_location: e.target.value
                  })} placeholder="e.g., Rack A3, Wine Cellar" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Optimal Drinking Window</Label>
                    <Input value={editForm.optimal_drinking_window} onChange={e => setEditForm({
                    ...editForm,
                    optimal_drinking_window: e.target.value
                  })} placeholder="e.g., 2025-2035" className="bg-[#2a2420] border-gray-700 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Description</Label>
                    <Textarea value={editForm.description} onChange={e => setEditForm({
                    ...editForm,
                    description: e.target.value
                  })} placeholder="Wine description..." className="bg-[#2a2420] border-gray-700 text-white" rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Notes</Label>
                    <Textarea value={editForm.notes} onChange={e => setEditForm({
                    ...editForm,
                    notes: e.target.value
                  })} placeholder="Add personal notes about this wine..." className="bg-[#2a2420] border-gray-700 text-white" rows={4} />
                  </div>
                  <Button onClick={handleUpdateWine} className="w-full bg-[#5c2e2e] hover:bg-[#4a2424]">
                    Save Changes
                  </Button>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Layout>;
};
export default WineDetail;