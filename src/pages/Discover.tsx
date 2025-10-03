import Layout from "@/components/Layout";
import { Compass } from "lucide-react";

const Discover = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-background to-wine-cream">
        <div className="bg-primary text-primary-foreground px-4 pt-8 pb-6 shadow-wine">
          <h1 className="text-3xl font-serif font-bold mb-2">Discover</h1>
          <p className="text-primary-foreground/80">Explore new wines</p>
        </div>

        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center">
            <Compass className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground">
              Discover wine recommendations and trends
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Discover;
