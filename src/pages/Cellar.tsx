import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Wine, Plus, Search, Pencil, Check, X } from "lucide-react";
import wineVirtueLogo from "@/assets/wine-virtue-logo.png";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrape } from "@/lib/normalizeGrape";
import { Session } from "@supabase/supabase-js";
import { CaveStickyHeader, Eyebrow, Plate } from "@/components/CaveChrome";
import { revealDelay } from "@/lib/cave-motion";

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
  description?: string | null;
  ai_tasting_notes?: string | null;
  optimal_drinking_window?: string | null;
  storage_locations?: Array<{
    location: string;
    quantity: number;
  }>;
}

/* The window is free text ("2024-2030", "Drink 2026 to 2032"). Read the two
   years out of it and say nothing at all when it cannot be read: a confident
   "Ready" over an unparsed string is worse than no marker. */
function drinkStatus(
  window: string | null | undefined,
  archived: boolean,
): "ready" | "hold" | "archived" | null {
  if (archived) return "archived";
  if (!window) return null;
  const years = window.match(/\d{4}/g);
  if (!years || years.length === 0) return null;
  const now = new Date().getFullYear();
  const from = Number(years[0]);
  const to = years.length > 1 ? Number(years[1]) : from;
  if (now < from) return "hold";
  if (now <= to) return "ready";
  return null;
}

const grapeNames = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw
        .map((g: any) => (typeof g === "string" ? g : g?.name))
        .filter((n: unknown): n is string => typeof n === "string" && !!n.trim())
    : [];

/** A filter group in the rail: mono header showing its value, ruled options. */
const FilterGroup = ({
  label,
  value,
  options,
  onPick,
  open,
  onToggle,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; count: number }>;
  onPick: (v: string) => void;
  open: boolean;
  onToggle: () => void;
}) => (
  <div className="border-t border-muted">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-baseline justify-between gap-3 py-3 text-left"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[10px] tracking-[0.05em] text-wine-champagne">
        {value === "all" ? "All" : value}
      </span>
    </button>
    <div className="cave-expand" data-open={open}>
      <div>
        <div className="pb-3">
          {[{ value: "all", label: "All", count: options.reduce((n, o) => n + o.count, 0) }, ...options].map(
            (o) => {
              const selected = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onPick(o.value)}
                  className={`flex w-full items-baseline justify-between gap-3 border-t border-muted py-2 text-left transition-[color,padding] duration-[320ms] ease-[var(--ease-cave)] ${
                    selected ? "pl-1.5 text-primary" : "text-wine-champagne hover:text-foreground"
                  }`}
                >
                  <span className="truncate text-[13px]">{o.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{o.count}</span>
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  </div>
);

const SORTS = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name A-Z" },
  { value: "year-new", label: "Newest Year" },
  { value: "year-old", label: "Oldest Year" },
  { value: "stock", label: "Stock" },
];

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
  const [openGroup, setOpenGroup] = useState<string | null>("type");
  // A preview without leaving the list. Opening the bottle page stays primary.
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Editable subtitle states
  const [cellarSubtitle, setCellarSubtitle] = useState<string>(
    "To taste is to feel. To collect is to remember",
  );
  const [archiveSubtitle, setArchiveSubtitle] = useState<string>(
    "Archive - All wines including out of stock",
  );
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [tempSubtitle, setTempSubtitle] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });
    const {
      data: { subscription },
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
      const channel = supabase
        .channel("wines-updates")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "wines",
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            setWines((currentWines) =>
              currentWines.map((wine) =>
                wine.id === payload.new.id ? { ...wine, ...payload.new } : wine,
              ),
            );
            toast.success("Wine images processed!");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "wines",
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            setWines((currentWines) => [payload.new as WineData, ...currentWines]);
          },
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
    return undefined;
  }, [session]);

  const fetchWines = async () => {
    try {
      if (!session?.user?.id) {
        setWines([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("wines")
        .select("*", { count: "exact" })
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const transformedWines = (data || []).map((wine) => ({
        ...wine,
        storage_locations: Array.isArray(wine.storage_locations)
          ? (wine.storage_locations as Array<{ location: string; quantity: number }>)
          : [],
      })) as unknown as WineData[];
      setWines(transformedWines);
    } catch (error: any) {
      toast.error("Failed to load wines");
      console.error("Fetch wines error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWines = wines
    .filter((wine) => {
      const isArchived = wine.current_stock === 0;
      if (!showArchive && isArchived) return false;

      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        wine.wine_name.toLowerCase().includes(searchLower) ||
        wine.producer?.toLowerCase().includes(searchLower) ||
        wine.vintage_year?.toString().includes(searchQuery) ||
        wine.country?.toLowerCase().includes(searchLower) ||
        wine.wine_type?.toLowerCase().includes(searchLower) ||
        wine.region?.toLowerCase().includes(searchLower) ||
        wine.appellation?.toLowerCase().includes(searchLower) ||
        wine.storage_location?.toLowerCase().includes(searchLower) ||
        (wine.storage_locations &&
          wine.storage_locations.some((loc) => loc.location.toLowerCase().includes(searchLower))) ||
        grapeNames(wine.grape_varietals).some((g) => g.toLowerCase().includes(searchLower));

      const matchesType = filterType === "all" || wine.wine_type === filterType;
      const matchesYear = filterYear === "all" || wine.vintage_year?.toString() === filterYear;
      const matchesGrape =
        filterGrape === "all" ||
        grapeNames(wine.grape_varietals).some(
          (name) => name.trim().toLowerCase() === filterGrape.trim().toLowerCase(),
        );
      const matchesCountry =
        filterCountry === "all" ||
        (wine.country ?? "").trim().toLowerCase() === filterCountry.toLowerCase();
      const matchesLocation =
        filterLocation === "all" ||
        wine.storage_location === filterLocation ||
        (wine.storage_locations &&
          wine.storage_locations.some((loc) => loc.location === filterLocation));
      return (
        matchesSearch &&
        matchesType &&
        matchesYear &&
        matchesGrape &&
        matchesCountry &&
        matchesLocation
      );
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
        default:
          return 0;
      }
    });

  const activeWines = wines.filter((w) => w.current_stock > 0);
  const archivedWines = wines.filter((w) => w.current_stock === 0);

  /* Options carry a live count, so the rail says how much a filter would
     leave behind before it is tapped. Counted over the archive-visible set,
     which is what the list is drawn from. */
  const inScope = wines.filter((w) => showArchive || w.current_stock > 0);
  const countBy = (pred: (w: WineData) => boolean) => inScope.filter(pred).length;

  const uniqueTypes = Array.from(
    new Set(wines.map((w) => w.wine_type).filter((v): v is string => Boolean(v))),
  );
  const uniqueYears = Array.from(
    new Set(wines.map((w) => w.vintage_year).filter((v): v is number => v !== null && v !== undefined)),
  ).sort((a, b) => b - a);
  const uniqueGrapes = Array.from(
    wines
      .flatMap((wine) => grapeNames(wine.grape_varietals))
      .reduce((map: Map<string, string>, raw: string) => {
        const normalized = normalizeGrape(raw);
        if (normalized && !map.has(normalized.toLowerCase())) map.set(normalized.toLowerCase(), normalized);
        return map;
      }, new Map<string, string>())
      .values(),
  ).sort();
  const uniqueCountries = Array.from(
    wines
      .reduce((map, w) => {
        const normalized = normalizeCountry(w.country);
        if (normalized && !map.has(normalized.toLowerCase())) map.set(normalized.toLowerCase(), normalized);
        return map;
      }, new Map<string, string>())
      .values(),
  ).sort();
  const uniqueLocations = Array.from(
    new Set(
      wines
        .flatMap((w) => {
          if (w.storage_locations && w.storage_locations.length > 0) {
            return w.storage_locations.map((loc) => loc.location);
          }
          return w.storage_location ? [w.storage_location] : [];
        })
        .filter(Boolean),
    ),
  ).sort();

  const totalBottles = activeWines.reduce((sum, wine) => sum + wine.current_stock, 0);

  const subtitle = showArchive ? archiveSubtitle : cellarSubtitle;
  const commitSubtitle = () => {
    if (showArchive) setArchiveSubtitle(tempSubtitle);
    else setCellarSubtitle(tempSubtitle);
    setIsEditingSubtitle(false);
  };

  const stats = [
    { label: "Bottles", value: totalBottles },
    { label: "Active", value: activeWines.length },
    { label: "Archived", value: archivedWines.length },
  ];

  return (
    <Layout>
      <CaveStickyHeader
        title="No wine, no sex"
        status={`${filteredWines.length} shown`}
      />

      <div className="mx-auto max-w-[1180px] px-7 pt-12">
        <Eyebrow>The cellar</Eyebrow>
        <h1 className="mt-2 font-serif font-bold leading-[1.02] tracking-[-0.02em] text-foreground text-[clamp(38px,5.6vw,62px)]">
          No wine, no sex
        </h1>

        {isEditingSubtitle ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={tempSubtitle}
              onChange={(e) => setTempSubtitle(e.target.value)}
              className="flex-1 border-b border-border bg-transparent py-1 text-[15px] text-foreground focus:border-primary focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSubtitle();
                else if (e.key === "Escape") setIsEditingSubtitle(false);
              }}
            />
            <button onClick={commitSubtitle} aria-label="Save" className="p-1 text-primary">
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsEditingSubtitle(false)}
              aria-label="Cancel"
              className="p-1 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            className="group mt-3 flex items-center gap-2 text-left"
            onClick={() => {
              setTempSubtitle(subtitle);
              setIsEditingSubtitle(true);
            }}
          >
            <span className="text-[15px] text-wine-champagne">{subtitle}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-[0.42] transition-opacity duration-[320ms] group-hover:opacity-100" />
          </button>
        )}

        {/* Stats: ruled top and bottom, all three derived from the collection. */}
        <div className="mt-9 flex flex-wrap border-y border-border py-6">
          {stats.map((s) => (
            <div key={s.label} className="flex-[1_1_150px]">
              <div className="font-serif text-[36px] font-semibold leading-none text-foreground">
                {s.value}
              </div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-start gap-x-10 gap-y-8 pb-8">
          {/* Filter rail. Stacks above the list on phone with no media query. */}
          <aside className="flex-[1_1_210px] max-w-[250px] lg:sticky lg:top-[92px]">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your collection…"
                className="w-full bg-transparent py-1 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div className="mt-5">
              <FilterGroup
                label="Type"
                value={filterType}
                open={openGroup === "type"}
                onToggle={() => setOpenGroup(openGroup === "type" ? null : "type")}
                onPick={setFilterType}
                options={uniqueTypes.map((t) => ({
                  value: t,
                  label: t,
                  count: countBy((w) => w.wine_type === t),
                }))}
              />
              <FilterGroup
                label="Country"
                value={filterCountry}
                open={openGroup === "country"}
                onToggle={() => setOpenGroup(openGroup === "country" ? null : "country")}
                onPick={setFilterCountry}
                options={uniqueCountries.map((c) => ({
                  value: c,
                  label: c,
                  count: countBy((w) => (w.country ?? "").trim().toLowerCase() === c.toLowerCase()),
                }))}
              />
              <FilterGroup
                label="Grape"
                value={filterGrape}
                open={openGroup === "grape"}
                onToggle={() => setOpenGroup(openGroup === "grape" ? null : "grape")}
                onPick={setFilterGrape}
                options={uniqueGrapes.map((g) => ({
                  value: g,
                  label: g,
                  count: countBy((w) =>
                    grapeNames(w.grape_varietals).some(
                      (n) => n.trim().toLowerCase() === g.trim().toLowerCase(),
                    ),
                  ),
                }))}
              />
              {/* Kept from the shipped screen: the spec's rail lists four groups,
                  but dropping Year would remove a filter the app already has. */}
              <FilterGroup
                label="Vintage"
                value={filterYear}
                open={openGroup === "year"}
                onToggle={() => setOpenGroup(openGroup === "year" ? null : "year")}
                onPick={setFilterYear}
                options={uniqueYears.map((y) => ({
                  value: y.toString(),
                  label: y.toString(),
                  count: countBy((w) => w.vintage_year === y),
                }))}
              />
              <FilterGroup
                label="Location"
                value={filterLocation}
                open={openGroup === "location"}
                onToggle={() => setOpenGroup(openGroup === "location" ? null : "location")}
                onPick={setFilterLocation}
                options={uniqueLocations.map((l) => ({
                  value: l,
                  label: l,
                  count: countBy(
                    (w) =>
                      w.storage_location === l ||
                      !!w.storage_locations?.some((loc) => loc.location === l),
                  ),
                }))}
              />
            </div>

            <div className="mt-7 border-t border-border pt-4">
              <Eyebrow className="text-[9px]">Sort</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSortBy(s.value)}
                    className={`font-mono text-[10px] uppercase tracking-[0.07em] transition-colors duration-[320ms] ${
                      sortBy === s.value
                        ? "border-b border-primary text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowArchive(!showArchive)}
              className={`mt-6 w-full border px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.09em] transition-colors duration-[320ms] ${
                showArchive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {showArchive ? "Hide archive" : `View archive (${archivedWines.length})`}
            </button>
          </aside>

          {/* The list. */}
          <div className="flex-[3_1_460px]">
            {loading ? (
              <p className="py-16 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
                Reading the cellar…
              </p>
            ) : filteredWines.length === 0 ? (
              <div className="border-t border-muted py-16">
                {wines.length === 0 ? (
                  <>
                    <p className="font-serif text-[26px] text-foreground">Nothing in here yet.</p>
                    <p className="mt-2 text-[15px] text-wine-champagne">
                      Start building your collection by adding your first bottle
                    </p>
                    <Button onClick={() => navigate("/add")} className="mt-6">
                      <Plus className="h-4 w-4" />
                      Add your first wine
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-[26px] text-foreground">Nothing matches that.</p>
                    <p className="mt-2 text-[15px] text-wine-champagne">
                      Clear the search, or widen a filter.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div>
                {filteredWines.map((wine, index) => {
                  const displayQuantity =
                    filterLocation !== "all" && wine.storage_locations
                      ? wine.storage_locations.find((loc) => loc.location === filterLocation)
                          ?.quantity || 0
                      : wine.current_stock;
                  const status = drinkStatus(
                    wine.optimal_drinking_window,
                    wine.current_stock === 0,
                  );
                  const isOpen = openRow === wine.id;
                  const grapes = grapeNames(wine.grape_varietals);
                  const note = wine.ai_tasting_notes || wine.description;

                  return (
                    <div
                      key={wine.id}
                      className={`cave-reveal border-t border-muted transition-colors duration-[420ms] ease-[var(--ease-cave)] ${
                        isOpen ? "bg-secondary/50" : "hover:bg-secondary/50"
                      }`}
                      style={{ animationDelay: revealDelay(index) }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenRow(isOpen ? null : wine.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-start gap-5 px-2 py-5 text-left"
                      >
                        <Plate
                          className={`w-[clamp(76px,15vw,108px)] transition-colors duration-[420ms] ${
                            isOpen ? "border-wine-champagne" : ""
                          }`}
                        >
                          {wine.images?.overall ? (
                            <img
                              src={wine.images.overall}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-[900ms] ease-[var(--ease-cave)] hover:scale-105 rounded-md"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <Wine className="h-7 w-7 text-muted-foreground" strokeWidth={1.4} />
                            </span>
                          )}
                        </Plate>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3
                              className={`font-serif text-[21px] leading-tight tracking-[-0.005em] transition-colors duration-[420ms] ${
                                isOpen ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {wine.wine_name}
                            </h3>
                            {status === "ready" && (
                              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-primary">
                                <span className="cave-ember inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                                Ready
                              </span>
                            )}
                            {status === "hold" && (
                              <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                                Hold
                              </span>
                            )}
                            {status === "archived" && (
                              <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                                Archived
                              </span>
                            )}
                          </div>

                          <p className="mt-1.5 font-mono text-[11px] tracking-[0.05em] text-wine-champagne">
                            {[
                              wine.producer,
                              wine.vintage_year,
                              [wine.region, wine.country].filter(Boolean).join(", "),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {(grapes.length > 0 || wine.storage_location) && (
                            <p className="mt-1 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                              {[grapes.join(", "), wine.storage_location].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-serif text-[26px] leading-none text-foreground">
                            {displayQuantity}
                          </div>
                          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                            in stock
                          </div>
                        </div>
                      </button>

                      {/* Opens in place. Navigation stays the primary path. */}
                      <div className="cave-expand" data-open={isOpen}>
                        <div>
                          <div className="px-2 pb-6 pl-[calc(clamp(76px,15vw,108px)+1.25rem+0.5rem)]">
                            {note && (
                              <p className="max-w-[62ch] text-[15px] leading-[1.6] text-wine-champagne">
                                {note}
                              </p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {wine.optimal_drinking_window && (
                                <span className="border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.07em] text-wine-champagne rounded-md">
                                  Window {wine.optimal_drinking_window}
                                </span>
                              )}
                              {wine.wine_type && (
                                <span className="border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.07em] text-wine-champagne rounded-md">
                                  {wine.wine_type}
                                </span>
                              )}
                            </div>
                            <div className="mt-5 flex flex-wrap gap-3">
                              <Button onClick={() => navigate(`/wine/${wine.id}`)}>
                                Open the bottle page
                              </Button>
                              <Button variant="outline" onClick={() => navigate("/pair")}>
                                Pair with dinner
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-muted" />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center pb-10">
          <img src={wineVirtueLogo} alt="Wine & Virtue" className="h-auto w-[240px] opacity-90" />
        </div>
      </div>
    </Layout>
  );
};

export default Cellar;
