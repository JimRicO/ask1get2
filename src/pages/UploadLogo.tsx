import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, Loader2, Upload } from "lucide-react";
import wineVirtueLogo from "@/assets/wine-virtue-logo.png";

const UploadLogo = () => {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");

  const uploadLogoToStorage = async () => {
    try {
      setUploading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      // Fetch the image from the imported asset
      const response = await fetch(wineVirtueLogo);
      const blob = await response.blob();
      
      // Create a File object
      const file = new File([blob], "wine-virtue-logo.png", { type: "image/png" });
      
      // Upload to Supabase Storage in user's folder
      const filePath = `${user.id}/wine-virtue-logo.png`;
      const { data, error } = await supabase.storage
        .from("wine-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true // Overwrite if exists
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("wine-images")
        .getPublicUrl(filePath);

      setPublicUrl(urlData.publicUrl);
      setUploaded(true);
      toast.success("Logo uploaded to Supabase Storage successfully!");
      
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Auto-upload on mount
  useEffect(() => {
    uploadLogoToStorage();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-elegant flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl p-8 max-w-md w-full border border-border/50">
        <div className="text-center">
          {uploading && (
            <>
              <Loader2 className="h-16 w-16 mx-auto mb-4 animate-spin text-primary" />
              <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">
                Uploading to Supabase Storage...
              </h2>
              <p className="text-muted-foreground">
                Please wait while we transfer the logo to your database storage.
              </p>
            </>
          )}

          {uploaded && !uploading && (
            <>
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">
                Upload Complete!
              </h2>
              <p className="text-muted-foreground mb-4">
                Your logo has been successfully uploaded to Supabase Storage.
              </p>
              
              <div className="bg-muted/50 rounded-lg p-4 mb-4 break-all text-left">
                <p className="text-xs font-mono text-wine-champagne">
                  {publicUrl}
                </p>
              </div>

              <img 
                src={publicUrl} 
                alt="Wine & Virtue Logo" 
                className="w-48 h-48 mx-auto mb-4 rounded-lg"
              />

              <Button
                onClick={() => window.location.href = "/cellar"}
                className="w-full"
              >
                Return to Cellar
              </Button>
            </>
          )}

          {!uploaded && !uploading && (
            <>
              <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">
                Upload Failed
              </h2>
              <Button
                onClick={uploadLogoToStorage}
                className="w-full mt-4"
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadLogo;
