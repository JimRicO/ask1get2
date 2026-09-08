import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { UtensilsCrossed, Loader2, Heart, Grape, AlertTriangle, MapPin } from "lucide-react";
import { pairFromCellar, discoverBottles } from "@/lib/pairing.functions";

/* ------------------------------------------------------------------ market */
/* Seeded silently from the browser locale, editable from the line under the
   button. Country decides what is buyable, not what the wine's origin is. */

const PRODUCING = new Set([
  "FR", "IT", "ES", "PT", "DE", "AT", "GR", "HU", "US", "AR", "CL", "ZA",
  "AU", "NZ", "GE", "MD", "RO", "BG", "CH", "SI", "HR", "UY", "CA", "IL", "LB",
]);

type Band = [number | null, number | null];
const CURRENCY: Record<string, { code: string; symbol: string; bands: Band[] }> = {
  ZA: { code: "ZAR", symbol: "R", bands: [[null, 200], [200, 600], [600, null]] },
  US: { code: "USD", symbol: "$", bands: [[null, 25], [25, 75], [75, null]] },
  GB: { code: "GBP", symbol: "£", bands: [[null, 20], [20, 60], [60, null]] },
  FR: { code: "EUR", symbol: "€", bands: [[null, 20], [20, 60], [60, null]] },
};
const DEFAULT_MARKET = {
  code: "EUR",
  symbol: "€",
  bands: [[null, 20], [20, 60], [60, null]] as Band[],
};

function detectCountry(): string | null {
  if (typeof navigator === "undefined") return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const region = tag?.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  }
  return null;
}

const bandLabel = (symbol: string, [min, max]: Band) =>
  min === null ? `Under ${symbol}${max}` : max === null ? `${symbol}${min}+` : `${symbol}${min} to ${symbol}${max}`;

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs transition-all border ${
      active
        ? "bg-primary text-primary-foreground border-primary shadow-elegant"
        : "bg-card/60 text-muted-foreground border-border/50 hover:border-border"
    }`}
  >
    {children}
  </button>
);

type Scope = "cellar" | "cellar_wishlist" | "anything";
type PairResult = Awaited<ReturnType<typeof pairFromCellar>>;
type Discovery = Awaited<ReturnType<typeof discoverBottles>>;

const Pairing = () => {
  const navigate = useNavigate();
  const pairFn = useServerFn(pairFromCellar);
  const discoverFn = useServerFn(discoverBottles);

  const [session, setSession] = useState<Session | null>(null);
  const [dish, setDish] = useState("");
  const [scope, setScope] = useState<Scope>("cellar");
  const [localOnly, setLocalOnly] = useState(false);
  const [bandIndex, setBandIndex] = useState<number | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [editingMarket, setEditingMarket] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PairResult | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("market_country")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const stored = (data as { market_country?: string | null } | null)?.market_country;
        if (stored) {
          setMarket(stored.toUpperCase());
          return;
        }
        const guess = detectCountry();
        if (guess) {
          setMarket(guess);
          const { error } = await supabase
            .from("profiles")
            .update({ market_country: guess } as never)
            .eq("id", session.user.id);
          if (error) toast.error("Could not save your market");
        }
      });
  }, [session]);

  const money = useMemo(() => (market && CURRENCY[market]) || DEFAULT_MARKET, [market]);
  const isProducing = !!market && PRODUCING.has(market);

  const saveMarket = async (value: string) => {
    const code = value.trim().toUpperCase().slice(0, 2);
    setEditingMarket(false);
    if (code.length !== 2 || !session) return;
    setMarket(code);
    setLocalOnly(false);
    setBandIndex(null);
    const { error } = await supabase
      .from("profiles")
      .update({ market_country: code } as never)
      .eq("id", session.user.id);
    if (error) toast.error("Could not save your market");
  };

  const run = async () => {
    if (dish.trim().length < 3) {
      toast.error("Tell me what you are cooking first");
      return;
    }

    const band = bandIndex === null ? null : money.bands[bandIndex];
    const shared = {
      dish: dish.trim(),
      localMode: (localOnly ? "only" : isProducing ? "preferred" : "off") as "only" | "preferred" | "off",
      marketCountry: market,
      currency: money.code,
      priceMin: band?.[0] ?? null,
      priceMax: band?.[1] ?? null,
    };

    setLoading(true);
    setResult(null);
    setDiscovery(null);

    try {
      const data = (await pairFn({ data: { ...shared, scope } })) as PairResult;
      setResult(data);

      // Grounded search is the slow layer, so it runs after the fast one has
      // painted rather than holding the whole response back.
      if (scope === "anything" && data.profile) {
        setDiscovering(true);
        discoverFn({
          data: {
            ...shared,
            profile: `${data.profile.headline}. ${data.profile.detail}`,
            grapes: data.grapes.map((g) => g.grape),
          },
        })
          .then((d) => setDiscovery(d as Discovery))
          .catch((e) => console.error("discovery failed", e))
          .finally(() => setDiscovering(false));
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="h-5 w-5 text-accent" />
          <h1 className="text-2xl font-semibold text-foreground">What are you cooking?</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">The cave answers first.</p>

        <Textarea
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          placeholder="Coq au vin for six. Or lamb chops with rosemary. Or last night's leftovers."
          rows={3}
          className="bg-card/60 border-border/50 resize-none mb-4"
        />

        {/* Scope is chosen before the call, not after. A narrow search costs less
            and answers faster, and the user is the one who knows how wide they want it. */}
        <div className="space-y-3 mb-5">
          <div className="flex flex-wrap gap-2">
            <Chip active={scope === "cellar"} onClick={() => setScope("cellar")}>My cave</Chip>
            <Chip active={scope === "cellar_wishlist"} onClick={() => setScope("cellar_wishlist")}>Cave + wishlist</Chip>
            <Chip active={scope === "anything"} onClick={() => setScope("anything")}>Anything</Chip>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip active={bandIndex === null} onClick={() => setBandIndex(null)}>Any price</Chip>
            {money.bands.map((b, i) => (
              <Chip key={i} active={bandIndex === i} onClick={() => setBandIndex(i)}>
                {bandLabel(money.symbol, b)}
              </Chip>
            ))}
          </div>

          {isProducing && (
            <div className="flex flex-wrap gap-2">
              <Chip active={localOnly} onClick={() => setLocalOnly(!localOnly)}>{market} wine only</Chip>
            </div>
          )}
        </div>

        <Button onClick={run} disabled={loading} className="w-full">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Pouring...</> : "Find a bottle"}
        </Button>

        <div className="mt-3 text-center text-xs text-muted-foreground">
          {editingMarket ? (
            <input
              autoFocus
              defaultValue={market ?? ""}
              maxLength={2}
              onBlur={(e) => saveMarket(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveMarket((e.target as HTMLInputElement).value)}
              className="w-14 text-center bg-card/60 border border-border/50 rounded px-2 py-1 uppercase"
            />
          ) : (
            <button onClick={() => setEditingMarket(true)} className="inline-flex items-center gap-1 hover:text-foreground">
              <MapPin className="h-3 w-3" />
              Prices in {money.code}{market ? ` · ${market}` : ""} · change
            </button>
          )}
        </div>

        {result && (
          <div className="mt-8 space-y-6">
            {/* Layer one. Renders on every search, including cave-only, because it
                explains why the picks below were chosen. */}
            {result.profile && (
              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-elegant">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">What this dish wants</p>
                <p className="text-foreground font-medium">{result.profile.headline}</p>
                <p className="text-sm text-foreground/80 mt-1">{result.profile.detail}</p>
              </div>
            )}

            {/* Layer two. */}
            {result.grapes.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Grape className="h-3.5 w-3.5" />
                  Grapes that do this
                </p>
                {result.grapes.map((g, i) => (
                  <div key={i} className="bg-card/60 rounded-xl p-4 border border-border/50">
                    <div className="flex justify-between items-baseline gap-3">
                      <p className="text-foreground font-medium">{g.grape}</p>
                      <span className="text-[10px] text-accent whitespace-nowrap">
                        {g.cellarIds.length > 0 ? `${g.cellarIds.length} in your cave` : "None in your cave"}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{g.why}</p>
                    {g.region && <p className="text-xs text-muted-foreground mt-1">{g.region}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Layer three, from the cave. Zero hallucination risk: these ids came
                out of the database and were validated on the way back. */}
            {result.picks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Open tonight</p>
                {result.picks.map(({ wine, why, serve, decantMinutes, caution, priceUnknown }) => (
                  <button
                    key={wine.id}
                    onClick={() => navigate(`/wine/${wine.id}`)}
                    className="w-full text-left bg-card rounded-xl p-4 border border-border/50 shadow-elegant hover:shadow-wine transition-all"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-foreground font-medium">{wine.wine_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[wine.producer, wine.vintage_year, wine.region].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {wine.current_stock} in stock
                      </span>
                    </div>

                    <p className="text-sm text-foreground/90 mt-2">{why}</p>

                    <div className="flex flex-wrap gap-2 mt-3 text-[10px]">
                      {serve && <span className="bg-[#3a3430] text-white px-2 py-1 rounded">Serve {serve}</span>}
                      {!!decantMinutes && <span className="bg-[#3a3430] text-white px-2 py-1 rounded">Decant {decantMinutes} min</span>}
                      {priceUnknown && <span className="bg-[#3a3430] text-muted-foreground px-2 py-1 rounded">No price on file</span>}
                    </div>

                    {caution && (
                      <p className="flex items-start gap-1.5 text-xs text-accent mt-3">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {caution}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {result.picks.length === 0 && result.cellarSize > 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing in the cave fits this one well. The profile above is what to look for.
              </p>
            )}

            {result.wishlistPicks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">On your wishlist, not in the cave</p>
                {result.wishlistPicks.map(({ wine, why }, i) => (
                  <div key={i} className="bg-card/60 rounded-xl p-4 border border-border/50">
                    <p className="flex items-center gap-2 text-foreground font-medium">
                      <Heart className="h-3.5 w-3.5 text-accent" />
                      {String(wine.wine_name)}
                    </p>
                    <p className="text-sm text-foreground/80 mt-1">{why}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Named bottles arrive late and separately. */}
            {discovering && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Looking for bottles you can buy
              </p>
            )}

            {discovery && discovery.bottles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Worth buying</p>
                {discovery.bottles.map((b, i) => (
                  <div key={i} className="bg-card/60 rounded-xl p-4 border border-border/50">
                    <p className="text-foreground font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[b.producer, b.origin, b.priceEstimate].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-sm text-foreground/80 mt-1">{b.why}</p>
                  </div>
                ))}
                {discovery.sources.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {discovery.sources.map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground underline">
                        {new URL(s).host}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {discovery && discovery.bottles.length === 0 && !discovering && (
              <p className="text-xs text-muted-foreground">
                No specific bottles found for {market ?? "your market"}. The grape and profile above still hold.
              </p>
            )}

            {result.gap && (
              <div className="bg-card/40 rounded-xl p-4 border border-dashed border-border/50">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">What is missing</p>
                <p className="text-sm text-foreground/80">{result.gap}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Pairing;
