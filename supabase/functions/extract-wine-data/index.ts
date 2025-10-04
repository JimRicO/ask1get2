import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new Error('No images provided');
    }

    // Build prompt based on available images
    const imageDescriptions = images.map(img => `${img.type} view`).join(', ');
    
    const extractionPrompt = `Analyze these wine bottle images (${imageDescriptions}) carefully and extract ALL visible information:

CRITICAL - ALWAYS extract these if visible on the label:
- Wine name (REQUIRED)
- Producer/Winery name
- Vintage year
- Wine type: MUST be EXACTLY one of these lowercase values: "red", "white", "rose", "sparkling", "dessert", "fortified"
- Country of origin
- Region/Appellation
- **Alcohol content (ABV %) - Look carefully on the label, usually shown as "% ABV", "% vol", or "% alc/vol"**
- **Grape varietals - Extract ALL grape varieties mentioned on the label (e.g., "Cabernet Sauvignon", "Merlot", "Chardonnay"). This is CRITICAL information that should always be extracted if present.**
- A detailed description (2-3 sentences) based on visible information about the wine's style, characteristics, and origin

IMPORTANT INSTRUCTIONS:
1. Examine ALL images thoroughly to find the alcohol content percentage - it's usually on the front or back label
2. Look for grape varietals on the front label, back label, or neck label - they are often prominently displayed
3. Combine information from all images to provide the most complete data possible
4. Pay special attention to small text that might contain ABV or grape information
5. **CRITICAL**: wine_type MUST be lowercase and ONLY one of: "red", "white", "rose", "sparkling", "dessert", "fortified"

Return ONLY valid JSON with these exact keys: wine_name, producer, vintage_year, wine_type, country, region, alcohol_content, grape_varietals, description.
- For grape_varietals: return as a string with varieties separated by commas (e.g., "Cabernet Sauvignon, Merlot")
- For alcohol_content: return as a number (e.g., 13.5)
- For wine_type: MUST be lowercase (e.g., "sparkling" not "Sparkling")
- If any information is truly not visible or unclear after careful examination, use null for that field.`;

    // Prepare content array with all images
    const content: any[] = [{ type: 'text', text: extractionPrompt }];
    
    for (const img of images) {
      const imageBase64 = img.data.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`
        }
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI processing failed: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content;

    if (!extractedText) {
      throw new Error('No response from AI');
    }

    // Try to parse the JSON response
    let extracted;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = extractedText.match(/```json\n?([\s\S]*?)\n?```/) || 
                       extractedText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : extractedText;
      extracted = JSON.parse(jsonStr);
      
      // Normalize wine_type to lowercase
      if (extracted.wine_type) {
        const lowerType = extracted.wine_type.toLowerCase();
        if (lowerType.includes("sparkling")) extracted.wine_type = "sparkling";
        else if (lowerType.includes("dessert") || lowerType.includes("sweet")) extracted.wine_type = "dessert";
        else if (lowerType.includes("fortified") || lowerType.includes("port") || lowerType.includes("sherry")) extracted.wine_type = "fortified";
        else if (lowerType.includes("rosé") || lowerType.includes("rose")) extracted.wine_type = "rose";
        else if (lowerType.includes("white")) extracted.wine_type = "white";
        else if (lowerType.includes("red")) extracted.wine_type = "red";
        else extracted.wine_type = null;
      }
    } catch (e) {
      console.error('Failed to parse AI response:', extractedText);
      // Return a partial result if parsing fails
      extracted = {
        wine_name: 'Unknown Wine',
        producer: null,
        vintage_year: null,
        wine_type: null,
        country: null,
        region: null,
        alcohol_content: null,
        grape_varietals: null,
      };
    }

    return new Response(
      JSON.stringify({ extracted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in extract-wine-data:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
