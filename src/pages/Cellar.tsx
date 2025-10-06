import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Wine, Plus, Search, Filter, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
interface WineData {
  id: string;
  wine_name: string;
  producer: string | null;
  vintage_year: number | null;
  wine_type: string | null;
  current_stock: number;
  images: any;
  grape_varietals: any;
  country: string | null;
  region: string | null;
  appellation: string | null;
  storage_location: string | null;
  storage_locations?: Array<{
    location: string;
    quantity: number;
  }>;
}
const Cellar = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<WineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterGrape, setFilterGrape] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [showArchive, setShowArchive] = useState<boolean>(false);
  
  // Editable subtitle states
  const [cellarSubtitle, setCellarSubtitle] = useState<string>("To taste is to feel. To collect is to remember");
  const [archiveSubtitle, setArchiveSubtitle] = useState<string>("Archive - All wines including out of stock");
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [tempSubtitle, setTempSubtitle] = useState("");
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
      fetchWines();

      // Set up realtime subscription for wine updates
      const channel = supabase.channel('wines-updates').on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wines',
        filter: `user_id=eq.${session.user.id}`
      }, payload => {
        // Update the wine in the list
        setWines(currentWines => currentWines.map(wine => wine.id === payload.new.id ? {
          ...wine,
          ...payload.new
        } : wine));
        toast.success("Wine images processed!");
      }).on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wines',
        filter: `user_id=eq.${session.user.id}`
      }, payload => {
        setWines(currentWines => [payload.new as WineData, ...currentWines]);
      }).subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session]);
  const fetchWines = async () => {
    try {
      if (!session?.user?.id) {
        setWines([]);
        setLoading(false);
        return;
      }
      const {
        data,
        error,
        count
      } = await supabase.from("wines").select("*", {
        count: 'exact'
      }).eq("user_id", session.user.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;

      // Transform storage_locations from Json to proper type
      const transformedWines: WineData[] = (data || []).map(wine => ({
        ...wine,
        storage_locations: Array.isArray(wine.storage_locations) ? wine.storage_locations as Array<{
          location: string;
          quantity: number;
        }> : []
      }));
      setWines(transformedWines);
    } catch (error: any) {
      toast.error("Failed to load wines");
      console.error("Fetch wines error:", error);
    } finally {
      setLoading(false);
    }
  };
  const filteredWines = wines.filter(wine => {
    // Archive filter - use archived_at field if available, fallback to stock
    const isArchived = wine.current_stock === 0;
    if (!showArchive && isArchived) return false;

    // Search filter - search across all wine fields
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" || wine.wine_name.toLowerCase().includes(searchLower) || wine.producer?.toLowerCase().includes(searchLower) || wine.vintage_year?.toString().includes(searchQuery) || wine.country?.toLowerCase().includes(searchLower) || wine.wine_type?.toLowerCase().includes(searchLower) || wine.region?.toLowerCase().includes(searchLower) || wine.appellation?.toLowerCase().includes(searchLower) || wine.storage_location?.toLowerCase().includes(searchLower) || wine.storage_locations && wine.storage_locations.some(loc => loc.location.toLowerCase().includes(searchLower)) || Array.isArray(wine.grape_varietals) && wine.grape_varietals.some((g: any) => {
      const grapeName = typeof g === 'string' ? g : g?.name;
      return grapeName?.toLowerCase().includes(searchLower);
    });

    // Type filter
    const matchesType = filterType === "all" || wine.wine_type === filterType;

    // Year filter
    const matchesYear = filterYear === "all" || wine.vintage_year?.toString() === filterYear;

    // Grape filter
    const matchesGrape = filterGrape === "all" || Array.isArray(wine.grape_varietals) && wine.grape_varietals.some((g: any) => typeof g === 'string' ? g === filterGrape : g?.name === filterGrape);

    // Country filter
    const matchesCountry = filterCountry === "all" || wine.country === filterCountry;

    // Location filter
    const matchesLocation = filterLocation === "all" || wine.storage_location === filterLocation || wine.storage_locations && wine.storage_locations.some(loc => loc.location === filterLocation);
    return matchesSearch && matchesType && matchesYear && matchesGrape && matchesCountry && matchesLocation;
  }).sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.wine_name.localeCompare(b.wine_name);
      case "year-new":
        return (b.vintage_year || 0) - (a.vintage_year || 0);
      case "year-old":
        return (a.vintage_year || 0) - (b.vintage_year || 0);
      case "stock":
        return b.current_stock - a.current_stock;
      default:
        // "recent"
        return 0;
      // Keep original order (by created_at DESC)
    }
  });
  const activeWines = wines.filter(w => w.current_stock > 0);
  const archivedWines = wines.filter(w => w.current_stock === 0);
  const uniqueTypes = Array.from(new Set(wines.map(w => w.wine_type).filter(Boolean)));
  const uniqueYears = Array.from(new Set(wines.map(w => w.vintage_year).filter(Boolean))).sort((a, b) => b - a);

  // Extract unique grape varietals from all wines
  const uniqueGrapes = Array.from(new Set(wines.flatMap(wine => Array.isArray(wine.grape_varietals) ? wine.grape_varietals.map((g: any) => typeof g === 'string' ? g : g?.name).filter(Boolean) : []))).sort();
  const uniqueCountries = Array.from(new Set(wines.map(w => w.country).filter(Boolean))).sort();
  const uniqueLocations = Array.from(new Set(wines.flatMap(w => {
    if (w.storage_locations && w.storage_locations.length > 0) {
      return w.storage_locations.map(loc => loc.location);
    }
    return w.storage_location ? [w.storage_location] : [];
  }).filter(Boolean))).sort();
  const totalBottles = activeWines.reduce((sum, wine) => sum + wine.current_stock, 0);
  const totalValue = activeWines.length;
  return <Layout>
      <div className="min-h-screen bg-[#211111]">
        {/* Modern Header with Gradient */}
        <div className="bg-[#211111] text-primary-foreground px-6 pt-12 pb-8 shadow-wine relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#211111] rounded-full blur-2xl"></div>
          
          <div className="relative">
            <h1 className="text-4xl font-serif font-bold mb-2 tracking-tight text-white">No wine, no sex</h1>
            
            {isEditingSubtitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempSubtitle}
                  onChange={(e) => setTempSubtitle(e.target.value)}
                  className="bg-white/10 text-white/90 text-sm font-medium px-3 py-1 rounded-lg border border-white/20 focus:outline-none focus:border-white/40 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (showArchive) {
                        setArchiveSubtitle(tempSubtitle);
                      } else {
                        setCellarSubtitle(tempSubtitle);
                      }
                      setIsEditingSubtitle(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingSubtitle(false);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (showArchive) {
                      setArchiveSubtitle(tempSubtitle);
                    } else {
                      setCellarSubtitle(tempSubtitle);
                    }
                    setIsEditingSubtitle(false);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <Check className="h-4 w-4 text-white" />
                </button>
                <button
                  onClick={() => setIsEditingSubtitle(false)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <div 
                className="flex items-center gap-2 group cursor-pointer"
                onClick={() => {
                  setTempSubtitle(showArchive ? archiveSubtitle : cellarSubtitle);
                  setIsEditingSubtitle(true);
                }}
              >
                <p className="text-white/90 text-sm font-medium">
                  {showArchive ? archiveSubtitle : cellarSubtitle}
                </p>
                <Pencil className="h-3 w-3 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>

        {/* Modern Stats Cards */}
        <div className="grid grid-cols-3 gap-3 px-6 -mt-6 relative z-10">
          <div className="bg-card rounded-2xl p-5 shadow-elegant hover:shadow-wine transition-all duration-300 border border-border/50">
            <div className="text-3xl font-bold text-white mb-1">{totalBottles}</div>
            <div className="text-xs text-muted-foreground font-medium">Bottles</div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-elegant hover:shadow-wine transition-all duration-300 border border-border/50">
            <div className="text-3xl font-bold text-white mb-1">{totalValue}</div>
            <div className="text-xs text-muted-foreground font-medium">Active</div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-elegant hover:shadow-wine transition-all duration-300 border border-border/50">
            <div className="text-3xl font-bold text-white mb-1">{archivedWines.length}</div>
            <div className="text-xs text-muted-foreground font-medium">Archived</div>
          </div>
        </div>


        {/* Modern Search & Filters */}
        <div className="px-6 mt-8 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input placeholder="Search your collection..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 rounded-xl border-border/50 bg-card shadow-sm focus:shadow-md transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Years</SelectItem>
                {uniqueYears.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterGrape} onValueChange={setFilterGrape}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Grape" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Grapes</SelectItem>
                {uniqueGrapes.map(grape => <SelectItem key={grape} value={grape}>{grape}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterCountry} onValueChange={setFilterCountry}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Countries</SelectItem>
                {uniqueCountries.map(country => <SelectItem key={country} value={country}>{country}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map(location => <SelectItem key={location} value={location}>{location}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="text-sm h-11 rounded-xl border-border/50 bg-card">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="year-new">Newest Year</SelectItem>
                <SelectItem value="year-old">Oldest Year</SelectItem>
                <SelectItem value="stock">Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Modern Wine Grid */}
        <div className="px-6 mt-6 pb-4">
          {loading ? <div className="text-center py-16">
              <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-muted-foreground mt-4 text-sm">Loading your collection...</p>
            </div> : filteredWines.length === 0 ? <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
                <Wine className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-xl font-serif font-semibold mb-2 text-white">No wines yet</h3>
              <p className="text-white/70 mb-8 max-w-sm mx-auto">
                Start building your collection by adding your first bottle
              </p>
              <Button onClick={() => navigate("/add")} className="bg-gradient-primary hover:opacity-90 transition-all shadow-wine h-12 px-8 rounded-xl font-semibold hover:scale-105 active:scale-95">
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Wine
              </Button>
            </div> : <div className="space-y-3">
              {filteredWines.map((wine, index) => {
            // Calculate quantity for filtered location
            const displayQuantity = filterLocation !== "all" && wine.storage_locations ? wine.storage_locations.find(loc => loc.location === filterLocation)?.quantity || 0 : wine.current_stock;
            return <div key={wine.id} onClick={() => navigate(`/wine/${wine.id}`)} className="group bg-card rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:shadow-wine transition-all duration-300 border border-border/50 hover:border-primary/30 animate-fade-in" style={{
              animationDelay: `${index * 0.05}s`
            }}>
                    <div className="flex items-center gap-4 flex-1">
                      {/* Modern wine bottle image */}
                      <div className="bg-gradient-to-br from-muted to-muted/50 rounded-2xl w-16 h-16 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/50 shadow-sm group-hover:shadow-md transition-all">
                        {wine.images?.front ? <img src={wine.images.front} alt={wine.wine_name} className="w-full h-full object-cover" /> : <Wine className="h-8 w-8 text-white/60" />}
                      </div>
                      
                      {/* Wine info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-base line-clamp-1 group-hover:text-white/90 transition-colors">
                          {wine.wine_name}
                        </h3>
                        <p className="text-sm text-white/70 font-medium mt-0.5">
                          {wine.vintage_year || "N/A"}
                        </p>
                        {wine.current_stock === 0 && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-muted text-white/60 italic">Archived</span>}
                      </div>
                    </div>
                    
                    {/* Stock count with modern design */}
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-3xl font-bold text-white">
                        {displayQuantity}
                      </div>
                    </div>
                  </div>;
          })}
            </div>}
        </div>

        {/* Modern Archive Toggle */}
        <div className="px-6 pb-8 mt-6">
          <Button onClick={() => setShowArchive(!showArchive)} variant={showArchive ? "default" : "outline"} className={`w-full h-12 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 ${showArchive ? "bg-gradient-primary hover:opacity-90 shadow-wine" : "hover:bg-muted/80 hover:border-primary/50"}`}>
            {showArchive ? "Hide Archive" : `View Archive (${archivedWines.length})`}
          </Button>
        </div>
      </div>
    </Layout>;
};
export default Cellar;