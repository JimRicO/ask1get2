import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

const Profile = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

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
      <div className="min-h-screen bg-gradient-to-b from-background to-wine-cream">
        <div className="bg-primary text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Profile</h1>
          <p className="text-primary-foreground/80">Manage your account</p>
        </div>

        <div className="px-4 mt-6 space-y-4">
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
