import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import wineVirtueLogo from "@/assets/wine-virtue-logo.png";

const Profile = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const manifesto = `No wine, No sex
Keep track of your bottles. Collection is recollection. Intimacy is legacy.

To taste is to feel.
To collect is to remember.

This is not an app.
It's your private archive.
Only fill your cellar with the bottles
that make you feel alive.

"Il faut être toujours ivre.
That's all there is to it — it's the only way.
But on what? Wine, poetry, or virtue, as you wish."
— Charles Baudelaire`;

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

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success("Signed out successfully");
      navigate("/auth");
    } catch (error: any) {
      toast.error("Failed to sign out");
    }
  };

  /* The manifesto string above is the shipped copy, unchanged. It is split
     here only to typeset it: the couplet wants its own ruled band and the
     Baudelaire wants a pull quote, and neither is reachable from one
     whitespace-preserved paragraph. */
  const blocks = manifesto.split("\n\n");
  const [openingTitle, ...openingRest] = (blocks[0] ?? "").split("\n");
  const couplet = (blocks[1] ?? "").split("\n");
  const archiveLines = (blocks[2] ?? "").split("\n");
  const quoteLines = (blocks[3] ?? "").split("\n");
  const attribution = quoteLines[quoteLines.length - 1] ?? "";
  const quoteBody = quoteLines.slice(0, -1);

  return (
    <Layout>
      <div className="min-h-screen">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-x-12 gap-y-10 px-7 pt-12 pb-10">
          {/* The manifesto is the screen, not a card on it. */}
          <div className="max-w-[660px] flex-[1_1_420px]">
            <h1 className="font-serif font-bold leading-[1.05] tracking-[-0.02em] text-foreground text-[clamp(30px,4.2vw,46px)]">
              {openingTitle}
            </h1>
            {openingRest.map((line, i) => (
              <p key={i} className="mt-4 max-w-[54ch] text-[18px] leading-[1.6] text-wine-champagne">
                {line}
              </p>
            ))}

            <div className="my-9 border-y border-border py-7">
              {couplet.map((line, i) => (
                <p
                  key={i}
                  className="font-serif italic leading-[1.3] text-foreground text-[clamp(20px,2.6vw,34px)]"
                >
                  {line}
                </p>
              ))}
            </div>

            {archiveLines.map((line, i) => (
              <p key={i} className="max-w-[54ch] text-[18px] leading-[1.6] text-wine-champagne">
                {line}
              </p>
            ))}

            <blockquote className="mt-9 border-l border-primary pl-6">
              {quoteBody.map((line, i) => (
                <p
                  key={i}
                  className="font-serif italic leading-[1.35] text-foreground text-[clamp(20px,2.6vw,34px)]"
                >
                  {line}
                </p>
              ))}
              <footer className="mt-3 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
                {attribution}
              </footer>
            </blockquote>
          </div>

          {/* Right column: the seal, then the account. This screen reads no
              other fields, so nothing else appears here. */}
          <div className="flex-[1_1_260px] lg:sticky lg:top-[92px]">
            <div className="flex justify-center">
              <img src={wineVirtueLogo} alt="Wine & Virtue" className="h-auto w-48 opacity-90" />
            </div>

            <div className="mt-8 border border-border bg-card p-6 rounded-md">
              <div className="flex items-center gap-4">
                <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border border-border">
                  <User className="h-7 w-7 text-wine-champagne" strokeWidth={1.6} />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-serif text-[21px] leading-tight text-foreground">
                    {session?.user?.user_metadata?.full_name || session?.user?.email}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                    {session?.user?.email}
                  </div>
                </div>
              </div>

              <Button onClick={handleSignOut} variant="outline" className="mt-6 w-full">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
