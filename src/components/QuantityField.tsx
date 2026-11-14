import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Number field that can be cleared while typing; clamps only on blur. */
export function QuantityField({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (text === "" || Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (n: number) => { const c = Math.max(min, n); setText(String(c)); onChange(c); };
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => commit((Number(text) || min) - 1)} disabled={(Number(text) || min) <= min}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        onFocus={e => e.target.select()}
        onChange={e => {
          const t = e.target.value.replace(/[^0-9]/g, "");
          setText(t);
          if (t !== "") onChange(Math.max(min, parseInt(t, 10)));
        }}
        onBlur={() => commit(text === "" ? min : parseInt(text, 10))}
        className="bg-card border-border text-foreground text-center"
      />
      <Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => commit((Number(text) || 0) + 1)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
