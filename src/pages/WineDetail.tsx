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
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-4 py-6 shadow-wine">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/cellar")}
            className="mb-2 -ml-2 text-primary-foreground hover:text-primary-foreground/80"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-serif font-bold">Wine Details</h1>
        </div>

        <div className="px-4 pb-8">
          {/* Main Wine Image */}
          <div className="bg-wine-cream rounded-2xl p-6 mt-6 shadow-elegant">
            {wine.images && typeof wine.images === 'object' && Object.values(wine.images)[0] ? (
              <img
                src={Object.values(wine.images)[0] as string}
                alt={wine.wine_name}
                className="w-full h-80 object-contain"
              />
            ) : (
              <div className="w-full h-80 flex items-center justify-center">
                <Wine className="h-32 w-32 text-primary/20" />
              </div>
            )}
          </div>

          {/* Wine Name & Location */}
          <div className="mt-6">
            <h2 className="text-2xl font-serif font-bold">{wine.wine_name}</h2>
            {(wine.country || wine.region) && (
              <p className="text-muted-foreground mt-1">
                {wine.region && wine.country ? `${wine.region}, ${wine.country}` : wine.region || wine.country}
              </p>
            )}
          </div>

          {/* Tasting Notes Section */}
          {tastingNotes.length > 0 && (
            <div className="bg-card rounded-2xl p-6 shadow-elegant mt-6">
              <h3 className="font-semibold text-lg mb-3">Tasting Notes</h3>
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
                    {note.food_pairing && (
                      <p className="text-xs text-muted-foreground">
                        Paired with: {note.food_pairing}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase Details */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant mt-6">
            <h3 className="font-semibold text-lg mb-4">Purchase Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Purchase Date</span>
                <span className="font-medium">{new Date(wine.created_at).toLocaleDateString()}</span>
              </div>
              {wine.price_per_bottle && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">${wine.price_per_bottle.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Quantity</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{wine.current_stock}</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setNewStock(wine.current_stock);
                      setEditStockDialogOpen(true);
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {wine.storage_location && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{wine.storage_location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Wine Info Grid */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant mt-6">
            <h3 className="font-semibold text-lg mb-4">Wine Information</h3>
            <div className="grid grid-cols-2 gap-4">
              {wine.vintage_year && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Vintage</div>
                  <div className="font-medium">{wine.vintage_year}</div>
                </div>
              )}
              {wine.wine_type && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Type</div>
                  <div className="font-medium capitalize">{wine.wine_type}</div>
                </div>
              )}
              {wine.alcohol_content && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">ABV</div>
                  <div className="font-medium">{wine.alcohol_content}%</div>
                </div>
              )}
              {wine.appellation && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Appellation</div>
                  <div className="font-medium">{wine.appellation}</div>
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

          {/* All Images */}
          {wine.images && typeof wine.images === 'object' && Object.keys(wine.images).length > 1 && (
            <div className="bg-card rounded-2xl p-6 shadow-elegant mt-6">
              <h3 className="font-semibold text-lg mb-4">All Photos</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(wine.images).map(([type, url]: [string, any]) => (
                  <div key={type} className="relative">
                    <img
                      src={url}
                      alt={`${type} view`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-xs font-medium capitalize">
                      {type === 'front' ? 'Front label' : type === 'back' ? 'Back label' : `${type} bottle`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-6">
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

            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>

          {/* Stock Edit Dialog */}
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
        </div>
      </div>
    </Layout>
  );
};

export default WineDetail;
