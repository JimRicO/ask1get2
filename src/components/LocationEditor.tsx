import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityField } from "@/components/QuantityField";
import { sameRack } from "@/lib/rackLabel";

export type Loc = { location: string; rack?: string; quantity: number };

/** Merge rows with same location (case-insensitive) + same rack; drop empty locations. */
export function mergeLocations(rows: Loc[]): Loc[] {
  const out: Loc[] = [];
  for (const r of rows) {
    const location = r.location.trim();
    if (!location) continue;
    const rack = r.rack?.trim() || undefined;
    const hit = out.find((o) => o.location.toLowerCase() === location.toLowerCase() && sameRack(o.rack ?? "", rack ?? ""));
    if (hit) hit.quantity += r.quantity;
    else out.push({ location, ...(rack ? { rack } : {}), quantity: r.quantity });
  }
  return out;
}

export function LocationEditor({ open, wineName, initial, fallbackQty, knownLocations, onClose, onSave }: {
  open: boolean; wineName: string; initial: Loc[]; fallbackQty: number; knownLocations: string[];
  onClose: () => void; onSave: (locs: Loc[]) => void;
}) {
  const [rows, setRows] = useState<Loc[]>([]);
  useEffect(() => {
    if (open) setRows(initial.length ? initial.map((l) => ({ ...l })) : [{ location: "", rack: "", quantity: Math.max(1, fallbackQty) }]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, p: Partial<Loc>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const merged = mergeLocations(rows);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-md border-primary/40 bg-popover text-popover-foreground">
        <DialogHeader className="text-left">
          <MapPin aria-hidden="true" className="mb-1 h-6 w-6 text-primary" />
          <DialogTitle className="font-serif text-2xl font-medium italic text-primary">Where it rests</DialogTitle>
          <DialogDescription className="break-words text-foreground">{wineName}</DialogDescription>
        </DialogHeader>
        <datalist id="cellar-known-locations">{knownLocations.map((l) => <option key={l} value={l} />)}</datalist>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex gap-2">
                <Input list="cellar-known-locations" placeholder="Location" value={r.location} onChange={(e) => set(i, { location: e.target.value })} className="bg-card" />
                <Input placeholder="Rack" value={r.rack ?? ""} onChange={(e) => set(i, { rack: e.target.value })} className="w-24 bg-card" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <QuantityField value={r.quantity} onChange={(n) => set(i, { quantity: n })} />
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove location" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => setRows((rs) => [...rs, { location: "", rack: "", quantity: 1 }])}>
            <Plus className="mr-1 h-4 w-4" /> Add another location
          </Button>
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={merged.length === 0} onClick={() => onSave(merged)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
