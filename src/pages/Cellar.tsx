import React from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Wine, Plus, Minus, Search, Pencil, Check, X } from "lucide-react";
import cellarSeal from "@/assets/wine-virtue-seal.png.asset.json";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { normalizeGrape } from "@/lib/normalizeGrape";
import { Session } from "@supabase/supabase-js";
import { CaveStickyHeader, Eyebrow, Plate } from "@/components/CaveChrome";
import { revealDelay } from "@/lib/cave-motion";
import { formatRack, sameRack } from "@/lib/rackLabel";
import CellarSommelier from "@/components/CellarSommelier";
import { LocationEditor } from "@/components/LocationEditor";
import { readCellarSnapshot, saveCellarSnapshot, cacheWine } from "@/lib/offline-cellar";
import { useOnline } from "@/hooks/use-online";

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
    rack?: string;
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
  total,
  nested,
}: {
  nested?: React.ReactNode;
  label: string;
  value: string;
  total: { ref: number; btls: number };
  options: Array<{ value: string; label: string; count: { ref: number; btls: number } }>;
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
          <div className="grid grid-cols-[1fr_2rem_2rem] gap-2 pb-1 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
            <span />
            <span className="text-right">Ref</span>
            <span className="text-right">Btl</span>
          </div>
          {[{ value: "all", label: "All", count: total }, ...options].map(
            (o) => {
              const selected = value === o.value;
              return (
                <React.Fragment key={o.value}>
                <button
                  type="button"
                  onClick={() => onPick(o.value)}
                  className={`grid w-full grid-cols-[1fr_2rem_2rem] items-baseline gap-2 border-t border-muted py-2 text-left transition-[color,padding] duration-[320ms] ease-[var(--ease-cave)] ${
                    selected ? "pl-1.5 text-primary" : "text-wine-champagne hover:text-foreground"
                  }`}
                >
                  <span className="min-w-0 break-words text-[13px] leading-tight">{o.label}</span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">{o.count.ref}</span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">{o.count.btls}</span>
                </button>
                {selected && o.value !== "all" && nested}
                </React.Fragment>
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
  const online = useOnline();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterGrape, setFilterGrape] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterRack, setFilterRack] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [showArchive, setShowArchive] = useState<boolean>(false);
  const [openGroup, setOpenGroup] = useState<string | null>("type");
  // A preview without leaving the list. Opening the bottle page stays primary.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editingLoc, setEditingLoc] = useState<WineData | null>(null);
  const [pendingArchive, setPendingArchive] = useState<{
    wine: WineData;
    locations: NonNullable<WineData["storage_locations"]>;
  } | null>(null);

  // Editable subtitle states
  const [cellarSubtitle, setCellarSubtitle] = useState<string>(
    "To taste is to feel. To collect is to remember.",
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
  }, [session?.user.id, online]);

  const fetchWines = async () => {
    try {
      if (!session?.user?.id) {
        setWines([]);
        setLoading(false);
        return;
      }
      const saved = await readCellarSnapshot(session.user.id);
      if (saved) {
        setWines(saved.wines.map((wine) => ({ ...wine, storage_locations: Array.isArray(wine.storage_locations) ? wine.storage_locations : [] })) as unknown as WineData[]);
        setLoading(false);
      }
      if (!navigator.onLine) {
        if (!saved) toast.error("No saved cellar on this device. Connect once to download it.");
        return;
      }
      // Explicit pagination avoids the Data API's default row ceiling.
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data: page, error } = await supabase.from("wines").select("*")
          .eq("user_id", session.user.id).order("created_at", { ascending: false }).order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(page ?? []));
        if (!page || page.length < 500) break;
      }
      const data = rows;
      await saveCellarSnapshot(session.user.id, data);

      const transformedWines = (data || []).map((wine) => ({
        ...wine,
        storage_locations: Array.isArray(wine.storage_locations)
          ? (wine.storage_locations as Array<{ location: string; rack?: string; quantity: number }>)
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

  // Quick +/- on the card. Adjusts the filtered location if any, else the first one.
  const changeStock = async (wine: WineData, delta: number) => {
    if (!navigator.onLine) { toast.error("Connect to update your cellar."); return; }
    const locs = [...(wine.storage_locations ?? [])];
    let next: number;
    if (locs.length > 0) {
      let i = filterLocation !== "all" ? locs.findIndex((l) => l.location === filterLocation && (filterRack === "all" || sameRack(l.rack, filterRack))) : -1;
      if (i < 0) i = delta < 0 ? locs.findIndex((l) => l.quantity > 0) : 0;
      if (i < 0) return;
      locs[i] = { ...locs[i], quantity: Math.max(0, locs[i].quantity + delta) };
      next = locs.reduce((s, l) => s + l.quantity, 0);
    } else {
      next = Math.max(0, wine.current_stock + delta);
    }
    if (next === wine.current_stock) return;
    if (next === 0) {
      setPendingArchive({ wine, locations: locs });
      return;
    }
    await saveStock(wine, next, locs);
  };

  const saveStock = async (wine: WineData, next: number, locs: NonNullable<WineData["storage_locations"]>) => {
    if (!navigator.onLine) { toast.error("Connect to update your cellar."); return; }
    const prev = wines;
    setWines((ws) => ws.map((w) => (w.id === wine.id ? { ...w, current_stock: next, storage_locations: locs } : w)));
    const { data, error } = await supabase
      .from("wines")
      .update({ current_stock: next, ...(locs.length > 0 ? { storage_locations: locs } : {}) })
      .eq("id", wine.id).select("*").single();
    if (error) {
      setWines(prev);
      toast.error("Failed to update quantity");
    } else if (data && session) {
      await cacheWine(session.user.id, data);
    }
  };

  const hasFilters =
    searchQuery.trim() !== "" ||
    [filterType, filterYear, filterGrape, filterCountry, filterLocation].some((f) => f !== "all");
  const clearFilters = () => {
    setSearchQuery("");
    setFilterType("all");
    setFilterYear("all");
    setFilterGrape("all");
    setFilterCountry("all");
    setFilterLocation("all");
    setFilterRack("all");
  };

  const filteredWines = wines
    .filter((wine) => {
      const isArchived = wine.current_stock === 0;
      if (showArchive !== isArchived) return false;

      const fold = (v: unknown) =>
        String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const tokens = fold(searchQuery).split(/\s+/).filter(Boolean);
      const haystack = fold(
        [
          wine.wine_name,
          wine.producer,
          wine.vintage_year,
          wine.country,
          wine.wine_type,
          wine.region,
          wine.appellation,
          wine.storage_location,
          ...(wine.storage_locations ?? []).flatMap((loc) => [loc.location, loc.rack]),
          ...grapeNames(wine.grape_varietals),
        ].join(" "),
      );
      const matchesSearch = tokens.every((t) => haystack.includes(t));

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
      const matchesRack =
        filterLocation === "all" ||
        filterRack === "all" ||
        !!wine.storage_locations?.some(
          (loc) => loc.location === filterLocation && sameRack(loc.rack, filterRack),
        );
      return (
        matchesSearch &&
        matchesType &&
        matchesYear &&
        matchesGrape &&
        matchesCountry &&
        matchesLocation &&
        matchesRack
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
  const inScope = wines.filter((w) => (showArchive ? w.current_stock === 0 : w.current_stock > 0));
  const countBy = (
    pred: (w: WineData) => boolean,
    btlsOf: (w: WineData) => number = (w) => w.current_stock || 0,
  ) => {
    const hit = inScope.filter(pred);
    return { ref: hit.length, btls: hit.reduce((n, w) => n + btlsOf(w), 0) };
  };
  const scopeTotal = countBy(() => true);

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

  const bottlesOf = (t: string) =>
    activeWines.filter((w) => w.wine_type === t).reduce((s, w) => s + w.current_stock, 0);
  const stats: { key: string; label: string; value: number; active: boolean; onClick: () => void }[] = [
    {
      key: "all",
      label: "Total bottles",
      value: totalBottles,
      active: !showArchive && filterType === "all",
      onClick: () => { setShowArchive(false); setFilterType("all"); },
    },
    ...(["sparkling", "white", "red"] as const).map((t) => ({
      key: t,
      label: t,
      value: bottlesOf(t),
      active: !showArchive && filterType === t,
      onClick: () => { setShowArchive(false); setFilterType(filterType === t && !showArchive ? "all" : t); },
    })),
    {
      key: "archived",
      label: "Archived",
      value: archivedWines.length,
      active: showArchive,
      onClick: () => { setShowArchive(!showArchive); setFilterType("all"); },
    },
  ];

  return (
    <Layout>
      <CaveStickyHeader
        title="Wine & Virtue"
        status={`${filteredWines.length} shown`}
      />

      <div className="mx-auto max-w-[1180px] px-4 pt-8 pb-6">
        <h1 className="page-title">
          Cellar
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
            className="group page-subtitle flex items-center gap-2 text-left"
            onClick={() => {
              setTempSubtitle(subtitle);
              setIsEditingSubtitle(true);
            }}
          >
            <span>{(() => { const i = subtitle.lastIndexOf("remember"); return i < 0 ? subtitle : (<>{subtitle.slice(0, i)}<em>remember</em>{subtitle.slice(i + 8)}</>); })()}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-[0.42] transition-opacity duration-[320ms] group-hover:opacity-100" />
          </button>
        )}

        {/* Stats: ruled top and bottom, all three derived from the collection. */}
        <div className="mt-9 flex flex-wrap gap-3">
          {stats.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={s.onClick}
              aria-pressed={s.active}
              className={`brass-plaque flex-[1_1_100px] px-4 py-4 text-left transition-shadow ${
                s.active ? "ring-2 ring-primary shadow-wine" : "opacity-85"
              }`}
            >
              <div className="font-serif text-[32px] font-semibold leading-none text-foreground">
                {s.value}
              </div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                {s.label}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-start gap-x-10 gap-y-8 pb-8">
          {/* Filter rail. Stacks above the list on phone with no media query. */}
          <aside className="wood-panel mx-auto flex-[1_1_210px] max-w-[280px] p-5 lg:sticky lg:top-[92px]">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your collection…"
                className="w-full bg-transparent py-1 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.11em] text-primary"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}

            <div className="mt-5">
              <FilterGroup
                total={scopeTotal}
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
                total={scopeTotal}
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
                total={scopeTotal}
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
                total={scopeTotal}
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
                total={scopeTotal}
                label="Location"
                value={filterLocation}
                open={openGroup === "location"}
                onToggle={() => setOpenGroup(openGroup === "location" ? null : "location")}
                onPick={(v) => { setFilterLocation(v); setFilterRack("all"); }}
                nested={(() => {
                  const racks = new Map<string, { label: string; ref: number; btls: number }>();
                  for (const w of wines) {
                    if ((w.current_stock === 0) !== showArchive) continue;
                    const seen = new Set<string>();
                    for (const loc of w.storage_locations ?? []) {
                      if (loc.location !== filterLocation || !loc.rack?.trim()) continue;
                      const k = loc.rack.trim().toLowerCase();
                      const e = racks.get(k) ?? { label: loc.rack.trim(), ref: 0, btls: 0 };
                      if (!seen.has(k)) { e.ref++; seen.add(k); }
                      e.btls += Number(loc.quantity) || 0;
                      racks.set(k, e);
                    }
                  }
                  if (racks.size === 0) return null;
                  const items = [{ value: "all", label: "All racks" }, ...[...racks.values()]
                    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
                    .map((e) => ({ value: e.label, label: formatRack(e.label), ref: e.ref, btls: e.btls }))];
                  return (
                    <div className="mb-1 ml-3 border-l border-muted pl-3">
                      {items.map((it) => {
                        const sel = it.value === "all" ? filterRack === "all" : sameRack(filterRack, it.value);
                        return (
                          <button
                            key={it.value}
                            type="button"
                            onClick={() => setFilterRack(it.value)}
                            className={`grid w-full grid-cols-[1fr_2rem_2rem] items-baseline gap-2 py-1.5 text-left transition-colors duration-[320ms] ${sel ? "text-primary" : "text-wine-champagne hover:text-foreground"}`}
                          >
                            <span className="min-w-0 break-words text-[12px] leading-tight">{it.label}</span>
                            <span className="text-right font-mono text-[10px] tabular-nums text-muted-foreground">{"ref" in it ? it.ref : ""}</span>
                            <span className="text-right font-mono text-[10px] tabular-nums text-muted-foreground">{"btls" in it ? it.btls : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                options={uniqueLocations.map((l) => ({
                  value: l,
                  label: l,
                  count: countBy(
                    (w) =>
                      w.storage_location === l ||
                      !!w.storage_locations?.some((loc) => loc.location === l),
                    (w) =>
                      w.storage_locations?.length
                        ? w.storage_locations
                            .filter((loc) => loc.location === l)
                            .reduce((n, loc) => n + (Number(loc.quantity) || 0), 0)
                        : w.current_stock || 0,
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
              className="btn-plate mt-6 h-10 w-full rounded-md px-4 text-sm font-medium"
              style={{ background: "color-mix(in srgb, var(--secondary) 40%, transparent)", border: "none", boxShadow: "none", color: "#E8986A" }}
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
                    <Button onClick={clearFilters} className="mt-6">
                      <X className="h-4 w-4" />
                      Clear filters
                    </Button>
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
                      className="cave-reveal"
                      style={{ animationDelay: revealDelay(index) }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenRow(isOpen ? null : wine.id)}
                        aria-expanded={isOpen}
                        className="wood-panel my-2 flex w-full items-start gap-5 px-4 py-4 text-left transition-transform duration-150 active:translate-y-px"
                      >
                        <Plate
                          className={`w-[clamp(76px,15vw,108px)] rounded-md shadow-[inset_0_2px_6px_rgba(0,0,0,0.7),0_10px_18px_-8px_rgba(0,0,0,0.95),0_2px_4px_rgba(0,0,0,0.6)] ring-1 ring-black/50 transition-colors duration-[420ms] ${
                            isOpen ? "border-wine-champagne" : ""
                          }`}
                        >
                          {wine.images?.overall ? (
                            <img
                              src={wine.images.overall}
                              loading="lazy"
                              decoding="async"
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
                          {grapes.length > 0 && (
                            <p className="mt-1 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                              {grapes.join(", ")}
                            </p>
                          )}
                          {(() => {
                            const locs = (wine.storage_locations ?? []).filter((l) => l.location?.trim());
                            const text = locs.length > 0
                              ? locs
                                  .map((l) => {
                                    const base = l.rack?.trim() ? `${l.location} · ${formatRack(l.rack)}` : l.location;
                                    return locs.length > 1 ? `${base} (${l.quantity})` : base;
                                  })
                                  .join(" · ")
                              : wine.storage_location;
                            return (
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Edit location"
                                onClick={(e) => { e.stopPropagation(); setEditingLoc(wine); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setEditingLoc(wine); } }}
                                className="mt-1 inline-flex items-center gap-1 rounded-sm font-mono text-[10px] tracking-[0.05em] text-wine-champagne/80 underline decoration-dotted underline-offset-2 hover:text-primary"
                              >
                                <Pencil aria-hidden="true" className="h-2.5 w-2.5" />
                                {text || "+ Add location"}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-serif text-[26px] leading-none text-foreground">
                            {displayQuantity}
                          </div>
                          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                            in stock
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            {([-1, 1] as const).map((d) => (
                              <span
                                key={d}
                                role="button"
                                tabIndex={0}
                                aria-label={d < 0 ? "One bottle less" : "One bottle more"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void changeStock(wine, d);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void changeStock(wine, d);
                                  }
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-wine-champagne/40 text-wine-champagne transition-colors active:bg-secondary"
                              >
                                {d < 0 ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                              </span>
                            ))}
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
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center pb-10">
          <img src={cellarSeal.url} alt="Wine & Virtue" className="h-auto w-[240px] rounded-full opacity-95 shadow-[0_18px_30px_-10px_rgba(0,0,0,0.95),0_4px_8px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(0,0,0,0.4)] [filter:drop-shadow(0_2px_1px_rgba(255,225,190,0.08))]" />
        </div>
      </div>
      {!online && <div role="status" className="fixed bottom-24 left-0 right-0 z-40 border-y border-primary/30 bg-background px-4 py-2 text-center text-sm text-primary">Offline · saved cellar · read only</div>}
      <CellarSommelier />
      <LocationEditor
        open={editingLoc !== null}
        wineName={editingLoc?.wine_name ?? ""}
        initial={(editingLoc?.storage_locations ?? []).filter((l) => l.location?.trim()).length
          ? (editingLoc?.storage_locations ?? []).filter((l) => l.location?.trim())
          : editingLoc?.storage_location ? [{ location: editingLoc.storage_location, quantity: Math.max(1, editingLoc.current_stock ?? 1) }] : []}
        fallbackQty={editingLoc?.current_stock ?? 1}
        knownLocations={Array.from(new Set(wines.flatMap((w) => [...(w.storage_locations ?? []).map((l) => l.location?.trim()), w.storage_location?.trim()]).filter((l): l is string => !!l)))}
        onClose={() => setEditingLoc(null)}
        onSave={(locs) => {
          const w = editingLoc; setEditingLoc(null);
          if (w) void saveStock(w, locs.reduce((n, l) => n + l.quantity, 0), locs);
        }}
      />
      <AlertDialog open={pendingArchive !== null} onOpenChange={(open) => { if (!open) setPendingArchive(null); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-md border-primary/40 bg-popover text-popover-foreground">
          <AlertDialogHeader className="text-left">
            <Wine aria-hidden="true" className="mb-2 h-7 w-7 text-primary" />
            <AlertDialogTitle className="font-serif text-2xl font-medium italic text-primary">The last bottle</AlertDialogTitle>
            <AlertDialogDescription className="break-words text-base leading-relaxed text-foreground">
              Move <span className="font-serif italic text-primary">{pendingArchive?.wine.wine_name}</span> to the archive? Your wine details and tasting notes will stay in your collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!pendingArchive) return;
              void saveStock(pendingArchive.wine, 0, pendingArchive.locations);
            }}>Move to archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Cellar;
