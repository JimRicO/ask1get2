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
    
    const extractionPrompt = `Analyze these wine bottle images (${imageDescriptions}) and extract the following information:
- Wine name
- Producer/Winery name
- Vintage year (if visible)
- Wine type (red, white, rosé, sparkling, dessert, or fortified)
- Country of origin
- Region/Appellation
- Alcohol content (ABV %)
- Grape varietals (if mentioned)
- A detailed description (2-3 sentences) of the wine based on visible information about its style, characteristics, and origin

Combine information from all images to give the most complete data possible.
Return ONLY valid JSON with these exact keys: wine_name, producer, vintage_year, wine_type, country, region, alcohol_content, grape_varietals, description.
If any information is not visible or unclear, use null for that field.`;

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
