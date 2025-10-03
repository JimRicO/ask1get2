import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Heart, Camera, Trash2, Loader2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
interface WishlistItem {
  id: string;
  wine_name: string;
  producer: string | null;
  vintage_year: number | null;
  wine_type: string | null;
  region: string | null;
  country: string | null;
  grape_varietals: string | null;
  image_url: string | null;
  created_at: string;
}
const Wishlist = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  useEffect(() => {
    if (session) {
      fetchWishlist();
    }
  }, [session]);
  const fetchWishlist = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("wishlist").select("*").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      setWishlistItems(data || []);
    } catch (error: any) {
      toast.error("Failed to load wishlist");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setProcessing(true);
    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result as string;

        // Upload image to storage
        const fileExt = file.name.split(".").pop();
        const fileName = `${session.user.id}/wishlist_${Date.now()}.${fileExt}`;
        const {
          error: uploadError
        } = await supabase.storage.from("wine-images").upload(fileName, file);
        if (uploadError) throw uploadError;
        const {
          data: {
            publicUrl
          }
        } = supabase.storage.from("wine-images").getPublicUrl(fileName);

        // Extract wine data using AI
        const {
          data: aiData,
          error: aiError
        } = await supabase.functions.invoke("extract-wine-name", {
          body: {
            image: base64Image
          }
        });
        if (aiError) throw aiError;
        const wineData = aiData?.wineData || {
          wine_name: "Unknown Wine",
          producer: null,
          vintage_year: null,
          wine_type: null,
          region: null,
          country: null,
          grape_varietals: null
        };

        // Add to wishlist
        const {
          error: insertError
        } = await supabase.from("wishlist").insert({
          user_id: session.user.id,
          wine_name: wineData.wine_name,
          producer: wineData.producer,
          vintage_year: wineData.vintage_year,
          wine_type: wineData.wine_type,
          region: wineData.region,
          country: wineData.country,
          grape_varietals: wineData.grape_varietals,
          image_url: publicUrl
        });
        if (insertError) throw insertError;
        toast.success(`Added "${wineData.wine_name}" to wishlist!`);
        fetchWishlist();
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || "Failed to process image");
      console.error(error);
    } finally {
      setProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  const handleDelete = async (id: string) => {
    try {
      const {
        error
      } = await supabase.from("wishlist").delete().eq("id", id);
      if (error) throw error;
      toast.success("Removed from wishlist");
      fetchWishlist();
    } catch (error: any) {
      toast.error("Failed to delete item");
      console.error(error);
    }
  };
  return <Layout>
      <div className="min-h-screen bg-[#211111]">
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Wishlist</h1>
          <p className="text-primary-foreground/80">Wines you want to try, to remember, to buy</p>
        </div>

        <div className="px-4 mt-6 pb-20">
          {/* Camera Button */}
          <div className="mb-6">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageCapture} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={processing} className="w-full bg-primary hover:bg-primary/90">
              {processing ? <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processing...
                </> : <>
                  <Camera className="h-5 w-5 mr-2" />
                  Take Photo of Wine Label
                </>}
            </Button>
          </div>

          {/* Wishlist Items */}
          {loading ? <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            </div> : wishlistItems.length === 0 ? <div className="text-center py-12">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-white">No wines yet</h3>
              <p className="text-muted-foreground">
                Take a photo of a wine label to add it to your wishlist
              </p>
            </div> : <div className="space-y-4">
              {wishlistItems.map(item => <div key={item.id} className="bg-[#211111] rounded-2xl p-6 flex items-start gap-6">
                  {/* Wine bottle image */}
                  <div className="bg-[#d4c4a8] rounded-xl w-14 h-14 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.image_url ? <img src={item.image_url} alt={item.wine_name} className="w-full h-full object-cover" /> : <Heart className="h-7 w-7 text-[#1a1410]" />}
                  </div>
                  
                  {/* Wine details - stacked vertically */}
                  <div className="flex-1 space-y-1">
                    {/* Line 1: Wine name */}
                    <h3 className="font-semibold text-white text-base">
                      {item.wine_name}
                    </h3>
                    
                    {/* Line 2: Wine type + Grape variety */}
                    <div className="flex items-center gap-3 text-sm text-white">
                      {item.wine_type && <span className="capitalize font-medium">{item.wine_type}</span>}
                      {item.grape_varietals && <span className="font-medium">{item.grape_varietals}</span>}
                    </div>
                    
                    {/* Line 3: Vintage year + Region */}
                    <div className="flex items-center gap-3 text-sm text-white/80">
                      {item.vintage_year && <span>{item.vintage_year}</span>}
                      {item.region && <span>{item.region}</span>}
                    </div>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex flex-col gap-3 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="text-white hover:text-blue-400 bg-white/10 hover:bg-white/20">
                      <Edit className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="text-white hover:text-red-400 bg-white/10 hover:bg-white/20">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>)}
            </div>}
        </div>
      </div>
    </Layout>;
};
export default Wishlist;