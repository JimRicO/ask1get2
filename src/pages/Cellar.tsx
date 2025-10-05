import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Wine, Plus, Search, Filter, SlidersHorizontal } from "lucide-react";
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
  storage_location: string | null;
  storage_locations?: Array<{location: string; quantity: number}>;
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

  useEffect(() => {
    if (session) {
      fetchWines();

      // Set up realtime subscription for wine updates
      const channel = supabase
        .channel('wines-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'wines',
            filter: `user_id=eq.${session.user.id}`
          },
          (payload) => {
            // Update the wine in the list
            setWines(currentWines => 
              currentWines.map(wine => 
                wine.id === payload.new.id ? { ...wine, ...payload.new } : wine
              )
            );
            toast.success("Wine images processed!");
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wines',
            filter: `user_id=eq.${session.user.id}`
          },
          (payload) => {
            setWines(currentWines => [payload.new as WineData, ...currentWines]);
          }
        )
        .subscribe();

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

      const { data, error, count } = await supabase
        .from("wines")
        .select("*", { count: 'exact' })
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Transform storage_locations from Json to proper type
      const transformedWines: WineData[] = (data || []).map(wine => ({
        ...wine,
        storage_locations: Array.isArray(wine.storage_locations) 
          ? wine.storage_locations as Array<{location: string; quantity: number}>
          : []
      }));
      setWines(transformedWines);
    } catch (error: any) {
      toast.error("Failed to load wines");
      console.error("Fetch wines error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWines = wines
    .filter(wine => {
      // Archive filter - use archived_at field if available, fallback to stock
      const isArchived = wine.current_stock === 0;
      if (!showArchive && isArchived) return false;
      
      // Search filter
      const matchesSearch = wine.wine_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wine.producer?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Type filter
      const matchesType = filterType === "all" || wine.wine_type === filterType;
      
      // Year filter
      const matchesYear = filterYear === "all" || wine.vintage_year?.toString() === filterYear;
      
      // Grape filter
      const matchesGrape = filterGrape === "all" || 
        (Array.isArray(wine.grape_varietals) && wine.grape_varietals.some((g: any) => 
          typeof g === 'string' ? g === filterGrape : g?.name === filterGrape
        ));
      
      // Country filter
      const matchesCountry = filterCountry === "all" || wine.country === filterCountry;
      
      // Location filter
      const matchesLocation = filterLocation === "all" || 
        wine.storage_location === filterLocation ||
        (wine.storage_locations && wine.storage_locations.some(loc => loc.location === filterLocation));
      
      return matchesSearch && matchesType && matchesYear && matchesGrape && matchesCountry && matchesLocation;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.wine_name.localeCompare(b.wine_name);
        case "year-new":
          return (b.vintage_year || 0) - (a.vintage_year || 0);
        case "year-old":
          return (a.vintage_year || 0) - (b.vintage_year || 0);
        case "stock":
          return b.current_stock - a.current_stock;
        default: // "recent"
          return 0; // Keep original order (by created_at DESC)
      }
    });

  const activeWines = wines.filter(w => w.current_stock > 0);
  const archivedWines = wines.filter(w => w.current_stock === 0);

  const uniqueTypes = Array.from(new Set(wines.map(w => w.wine_type).filter(Boolean)));
  const uniqueYears = Array.from(new Set(wines.map(w => w.vintage_year).filter(Boolean))).sort((a, b) => b - a);
  
  // Extract unique grape varietals from all wines
  const uniqueGrapes = Array.from(
    new Set(
      wines.flatMap(wine => 
        Array.isArray(wine.grape_varietals) 
          ? wine.grape_varietals.map((g: any) => typeof g === 'string' ? g : g?.name).filter(Boolean)
          : []
      )
    )
  ).sort();

  const uniqueCountries = Array.from(new Set(wines.map(w => w.country).filter(Boolean))).sort();
  const uniqueLocations = Array.from(
    new Set(
      wines.flatMap(w => {
        if (w.storage_locations && w.storage_locations.length > 0) {
          return w.storage_locations.map(loc => loc.location);
        }
        return w.storage_location ? [w.storage_location] : [];
      }).filter(Boolean)
    )
  ).sort();

  const totalBottles = activeWines.reduce((sum, wine) => sum + wine.current_stock, 0);
  const totalValue = activeWines.length;

  return (
    <Layout>
      <div className="min-h-screen bg-[#211111]">
        {/* Header */}
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">My Cellar</h1>
          <p className="text-primary-foreground/80">
            {showArchive ? "Archive - All wines including out of stock" : "Your active wine collection"}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 px-4 -mt-4">
          <div className="bg-[#211111] rounded-xl p-4 shadow-elegant">
            <div className="text-2xl font-bold text-primary">{totalBottles}</div>
            <div className="text-xs text-muted-foreground">Bottles</div>
          </div>
          <div className="bg-[#211111] rounded-xl p-4 shadow-elegant">
            <div className="text-2xl font-bold text-primary">{totalValue}</div>
            <div className="text-xs text-muted-foreground">Active Wines</div>
          </div>
          <div className="bg-[#211111] rounded-xl p-4 shadow-elegant">
            <div className="text-2xl font-bold text-primary">{archivedWines.length}</div>
            <div className="text-xs text-muted-foreground">Archived</div>
          </div>
        </div>


        {/* Search & Filters */}
        <div className="px-4 mt-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search wines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {uniqueYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterGrape} onValueChange={setFilterGrape}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Grape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grapes</SelectItem>
                {uniqueGrapes.map(grape => (
                  <SelectItem key={grape} value={grape}>{grape}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCountry} onValueChange={setFilterCountry}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {uniqueCountries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map(location => (
                  <SelectItem key={location} value={location}>{location}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="year-new">Newest Year</SelectItem>
                <SelectItem value="year-old">Oldest Year</SelectItem>
                <SelectItem value="stock">Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Wine Grid */}
        <div className="px-4 mt-6 pb-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            </div>
          ) : filteredWines.length === 0 ? (
            <div className="text-center py-12">
              <Wine className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No wines yet</h3>
              <p className="text-muted-foreground mb-6">
                Start building your collection by adding your first bottle
              </p>
              <Button
                onClick={() => navigate("/add")}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Wine
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredWines.map((wine) => {
                // Calculate quantity for filtered location
                const displayQuantity = filterLocation !== "all" && wine.storage_locations
                  ? wine.storage_locations.find(loc => loc.location === filterLocation)?.quantity || 0
                  : wine.current_stock;

                return (
                  <div
                    key={wine.id}
                    onClick={() => navigate(`/wine/${wine.id}`)}
                    className="bg-[#211111] rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#2a1a1a] transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {/* Wine bottle image */}
                      <div className="bg-[#d4c4a8] rounded-xl w-14 h-14 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {wine.images?.front ? (
                          <img 
                            src={wine.images.front} 
                            alt={wine.wine_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Wine className="h-7 w-7 text-[#1a1410]" />
                        )}
                      </div>
                      
                      {/* Wine info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-base line-clamp-1">
                          {wine.wine_name}
                        </h3>
                        <p className="text-sm text-white">
                          {wine.vintage_year || "N/A"}
                        </p>
                        {wine.current_stock === 0 && (
                          <span className="text-xs text-muted-foreground italic">Archived</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Stock count */}
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-2xl font-bold text-white">
                        {displayQuantity}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Archive Toggle */}
        <div className="px-4 pb-6 mt-6">
          <Button
            onClick={() => setShowArchive(!showArchive)}
            variant={showArchive ? "default" : "outline"}
            className="w-full"
          >
            {showArchive ? "Hide Archive" : `View Archive (${archivedWines.length})`}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Cellar;
