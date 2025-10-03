import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wine, MapPin, Calendar, Percent, DollarSign, Edit, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

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
      <div className="min-h-screen bg-gradient-to-b from-background to-wine-cream">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/cellar")}
            className="mb-4 -ml-2 text-primary-foreground hover:text-primary-foreground/80"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cellar
          </Button>
          <h1 className="text-2xl font-serif font-bold">{wine.wine_name}</h1>
          {wine.producer && <p className="text-primary-foreground/80 mt-1">{wine.producer}</p>}
        </div>

        {/* Images */}
        <div className="px-4 -mt-8">
          {wine.images && (typeof wine.images === 'object') && Object.keys(wine.images).length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(wine.images).map(([type, url]: [string, any]) => (
                <div key={type} className="relative">
                  <img
                    src={url}
                    alt={`${type} view`}
                    className="w-full h-48 object-cover rounded-xl shadow-elegant"
                  />
                  <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-xs font-medium capitalize">
                    {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : `${type} bottle`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-wine-cream to-muted rounded-2xl h-64 flex items-center justify-center shadow-elegant">
              <Wine className="h-32 w-32 text-primary/20" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-4 mt-6 space-y-4">
          <div className="bg-card rounded-2xl p-6 shadow-elegant">
            <h2 className="font-semibold text-lg mb-4">Wine Details</h2>
            <div className="grid grid-cols-2 gap-4">
              {wine.vintage_year && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Vintage</div>
                    <div className="font-medium">{wine.vintage_year}</div>
                  </div>
                </div>
              )}
              {wine.wine_type && (
                <div className="flex items-center gap-2">
                  <Wine className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Type</div>
                    <div className="font-medium capitalize">{wine.wine_type}</div>
                  </div>
                </div>
              )}
              {wine.country && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Country</div>
                    <div className="font-medium">{wine.country}</div>
                  </div>
                </div>
              )}
              {wine.region && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Region</div>
                    <div className="font-medium">{wine.region}</div>
                  </div>
                </div>
              )}
              {wine.appellation && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Appellation</div>
                    <div className="font-medium">{wine.appellation}</div>
                  </div>
                </div>
              )}
              {wine.alcohol_content && (
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">ABV</div>
                    <div className="font-medium">{wine.alcohol_content}%</div>
                  </div>
                </div>
              )}
              {wine.storage_location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div className="font-medium">{wine.storage_location}</div>
                  </div>
                </div>
              )}
              {wine.optimal_drinking_window && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Optimal Drinking</div>
                    <div className="font-medium">{wine.optimal_drinking_window}</div>
                  </div>
                </div>
              )}
            </div>
            
            {wine.grape_varietals && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-1">Grape Varietals</div>
                <div className="font-medium">
                  {Array.isArray(wine.grape_varietals) 
                    ? wine.grape_varietals.join(", ") 
                    : JSON.stringify(wine.grape_varietals)}
                </div>
              </div>
            )}
          </div>

          {wine.ai_tasting_notes && (
            <div className="bg-card rounded-2xl p-6 shadow-elegant">
              <h2 className="font-semibold text-lg mb-2">AI Tasting Notes</h2>
              <p className="text-sm text-muted-foreground">{wine.ai_tasting_notes}</p>
            </div>
          )}

          {wine.ai_food_pairings && wine.ai_food_pairings.length > 0 && (
            <div className="bg-card rounded-2xl p-6 shadow-elegant">
              <h2 className="font-semibold text-lg mb-2">Recommended Food Pairings</h2>
              <div className="flex flex-wrap gap-2">
                {wine.ai_food_pairings.map((pairing, index) => (
                  <span 
                    key={index} 
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                  >
                    {pairing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stock & Actions */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-muted-foreground">Current Stock</div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-primary">{wine.current_stock} bottles</div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setNewStock(wine.current_stock);
                      setEditStockDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {wine.price_per_bottle && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Value</div>
                  <div className="text-lg font-semibold">
                    ${(wine.price_per_bottle * wine.current_stock).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Dialog open={consumeDialogOpen} onOpenChange={setConsumeDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Tasting
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Tasting</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Rating</Label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            className="text-2xl"
                          >
                            {star <= rating ? "★" : "☆"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tasting Notes</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Describe the flavors, aromas..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Occasion</Label>
                      <Input
                        value={occasion}
                        onChange={(e) => setOccasion(e.target.value)}
                        placeholder="Dinner party, celebration..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Food Pairing</Label>
                      <Input
                        value={foodPairing}
                        onChange={(e) => setFoodPairing(e.target.value)}
                        placeholder="What did you pair it with?"
                      />
                    </div>
                    <Button onClick={handleConsume} className="w-full">
                      Save Tasting Note
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={editStockDialogOpen} onOpenChange={setEditStockDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Stock</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Number of Bottles</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newStock}
                        onChange={(e) => setNewStock(parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <Button onClick={handleUpdateStock} className="w-full">
                      Update Stock
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          {/* Tasting Notes */}
          {tastingNotes.length > 0 && (
            <div className="bg-card rounded-2xl p-6 shadow-elegant">
              <h2 className="font-semibold text-lg mb-4">Tasting History</h2>
              <div className="space-y-3">
                {tastingNotes.map((note) => (
                  <div key={note.id} className="border-l-2 border-primary pl-4 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm text-muted-foreground">
                        {new Date(note.tasting_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm">
                        {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                      </div>
                    </div>
                    {note.notes && <p className="text-sm">{note.notes}</p>}
                    {note.occasion && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Occasion: {note.occasion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default WineDetail;
