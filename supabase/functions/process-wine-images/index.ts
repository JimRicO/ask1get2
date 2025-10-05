import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { wineId, imageUrls } = await req.json();
    
    if (!wineId || !imageUrls) {
      return new Response(
        JSON.stringify({ error: "Wine ID and image URLs are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Starting background processing for wine ${wineId}`);

    // Process images in background
    const cleanedImageUrls: any = {};
    
    for (const [type, imageUrl] of Object.entries(imageUrls)) {
      try {
        console.log(`Processing ${type} image...`);
        
        // Call AI to remove background
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Remove the background from this wine bottle image and replace it with a clean, professional monochrome cream background. Do not modify the wine bottle, and maintain all label details."
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: imageUrl
                    }
                  }
                ]
              }
            ],
            modalities: ["image", "text"]
          }),
        });

        if (!response.ok) {
          console.error(`Failed to process ${type} image:`, response.status);
          cleanedImageUrls[type] = imageUrl; // Keep original
          continue;
        }

        const data = await response.json();
        const processedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!processedImageUrl) {
          console.error(`No processed image for ${type}`);
          cleanedImageUrls[type] = imageUrl; // Keep original
          continue;
        }

        // Convert base64 to blob and upload
        const base64Data = processedImageUrl.split(',')[1];
        const binaryData = atob(base64Data);
        const arrayBuffer = new ArrayBuffer(binaryData.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < binaryData.length; i++) {
          uint8Array[i] = binaryData.charCodeAt(i);
        }
        const blob = new Blob([uint8Array], { type: 'image/png' });
        
        // Extract user_id from wine record
        const { data: wineData } = await supabase
          .from("wines")
          .select("user_id")
          .eq("id", wineId)
          .single();

        if (!wineData) {
          console.error("Wine not found");
          cleanedImageUrls[type] = imageUrl;
          continue;
        }

        // Upload cleaned image
        const cleanedFileName = `${wineData.user_id}/${type}_cleaned_${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("wine-images")
          .upload(cleanedFileName, blob);
        
        if (uploadError) {
          console.error(`Failed to upload cleaned ${type}:`, uploadError);
          cleanedImageUrls[type] = imageUrl;
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from("wine-images")
            .getPublicUrl(cleanedFileName);
          cleanedImageUrls[type] = publicUrl;
          console.log(`Successfully processed ${type} image`);
        }
      } catch (error) {
        console.error(`Error processing ${type}:`, error);
        cleanedImageUrls[type] = imageUrl; // Keep original on error
      }
    }

    // Update wine record with cleaned images
    const { error: updateError } = await supabase
      .from("wines")
      .update({ images: cleanedImageUrls })
      .eq("id", wineId);

    if (updateError) {
      console.error("Failed to update wine with cleaned images:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update wine" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully updated wine ${wineId} with cleaned images`);

    return new Response(
      JSON.stringify({ success: true, wineId, cleanedImageUrls }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in process-wine-images function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});