import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  return (
    <Layout>
      <div className="min-h-screen bg-[#211111]">
        <div className="bg-[#211111] text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Profile</h1>
          <p className="text-primary-foreground/80">Manage your account</p>
        </div>

        <div className="px-4 mt-6 space-y-4">
          {/* Manifesto Section */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant border border-border/50">
            <h2 className="text-xl font-serif font-semibold text-white mb-4">No Wine No Sex — The Manifesto</h2>
            <p className="text-white/70 text-sm leading-relaxed italic whitespace-pre-line">
              {manifesto}
            </p>
          </div>

          {/* Wine & Virtue Logo */}
          <div className="flex justify-center my-8">
            <img src={wineVirtueLogo} alt="Wine & Virtue" className="w-48 h-auto opacity-90" />
          </div>

          {/* User Profile Section */}
          <div className="bg-card rounded-2xl p-6 shadow-elegant">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <div className="font-semibold">
                  {session?.user?.user_metadata?.full_name || session?.user?.email}
                </div>
                <div className="text-sm text-muted-foreground">
                  {session?.user?.email}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
