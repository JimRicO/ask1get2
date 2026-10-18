import { useEffect, useState } from "react";
import {
  DEFAULT_PREFS,
  EXPERT_SOURCES,
  getSommelierPrefs,
  setSommelierPrefs,
  type SommelierPrefs,
} from "@/lib/sommelier-prefs";

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            value === o.id
              ? "border-primary bg-primary/20 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SommelierBehaviorPicker() {
  const [prefs, setPrefs] = useState<SommelierPrefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(getSommelierPrefs()), []);

  function update(p: SommelierPrefs) {
    setPrefs(p);
    setSommelierPrefs(p);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="font-serif text-xl text-primary">Comportement du Sommelier</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Il ne prétend jamais avoir goûté un vin et dit d'où vient chaque information.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ton</p>
        <Choice
          value={prefs.tone}
          onChange={(tone) => update({ ...prefs, tone })}
          options={[
            { id: "strict", label: "Strict et factuel" },
            { id: "complice", label: "Complice et détendu" },
          ]}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Recherche sur Internet quand il ne sait pas</p>
        <Choice
          value={prefs.research}
          onChange={(research) => update({ ...prefs, research })}
          options={[
            { id: "auto", label: "Toujours chercher" },
            { id: "ask", label: "Me demander d'abord" },
            { id: "off", label: "Jamais" },
          ]}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Sources d'expertise à privilégier</p>
        <div className="flex flex-wrap gap-2">
          {EXPERT_SOURCES.map((s) => {
            const on = prefs.sources.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  update({
                    ...prefs,
                    sources: on ? prefs.sources.filter((x) => x !== s.id) : [...prefs.sources, s.id],
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
