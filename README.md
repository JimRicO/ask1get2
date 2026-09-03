# Wine Cellar

Build CellarKey - AI-Powered Wine Cellar Management PWA
Project Overview
Create a mobile-first Progressive Web App (PWA) for wine enthusiasts to manage their wine collection using AI-powered image recognition. Users can photograph wine bottles, and the app uses Google's Gemini AI to extract label information and provide enriched sommelier-level details.
Tech Stack Requirements
Frontend: React with TypeScript 
Styling: Tailwind CSS with mobile-first responsive design 
Backend: Supabase (PostgreSQL database with Row Level Security) 
Authentication: Supabase Auth with Google OAuth 
AI: Google Gemini API (gemini-2.0-flash-exp model) 
Storage: Supabase Storage for wine images 
State Management: Zustand for global state, React Query for server state 
PWA: Vite PWA plugin for offline functionality 
Core Features to Implement
1. Authentication
Google Sign-In via Supabase Auth 
Protected routes requiring authentication 
Persistent sessions with auto-refresh 
Biometric authentication support detection 
2. Wine Capture & AI Processing
Photo Capture Flow:
Mobile camera integration with label positioning guide 
Multiple photo capture (front label, back label, neck) 
Image compression before upload 
Upload to Supabase Storage 
AI Integration (Two-Phase Process):
Phase 1: Send image to Gemini API for OCR label extraction 
Phase 2: Send extracted data back to Gemini for enrichment 
Store both raw and enriched data in Supabase 
3. Database Schema (Supabase)
sql
-- Wines table with all necessary fields
CREATE TABLE wines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  wine_name TEXT NOT NULL,
  producer TEXT,
  vintage_year INTEGER,
  wine_type TEXT,
  grape_varietals JSONB,
  country TEXT,
  region TEXT,
  appellation TEXT,
  alcohol_content DECIMAL(3,1),
  current_stock INTEGER DEFAULT 1,
  price_per_bottle DECIMAL(10,2),
  storage_location TEXT,
  
  -- AI enriched fields
  ai_tasting_notes TEXT,
  ai_food_pairings TEXT[],
  optimal_drinking_window TEXT,
  critic_scores JSONB,
  
  -- Images
  images JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasting notes table
CREATE TABLE tasting_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  tasting_date DATE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  occasion TEXT,
  food_pairing TEXT
);

-- Enable RLS
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own wines" ON wines
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY "Users can manage own notes" ON tasting_notes
  FOR ALL USING (auth.uid() = user_id);
4. Mobile-First UI Requirements
Navigation:
Bottom navigation bar with 5 tabs: 
My Cellar (wine bottle icon) 
Add Wine (camera icon - center, prominent) 
Discover (compass icon) 
Wishlist (heart icon) 
Profile (user icon) 
Key Screens:
1. My Cellar (Home): 
Stats bar showing total bottles, value, countries 
Search and filter capabilities 
Grid view (2 columns) of wine cards 
Each card: image, name, vintage, stock count, rating 
Pull-to-refresh functionality 
Floating action button for quick add 
2. Add Wine Flow: 
Full-screen camera view with guide overlay 
Multi-step: capture → processing → review/edit → save 
Show AI processing status with loading animation 
Form with all extracted fields (editable) 
3. Wine Detail: 
Hero image section (swipeable if multiple photos) 
Information tabs: Details, AI Insights, History 
Quick actions: Consume, Edit, Share 
Bottom sheet modal for consumption logging 
4. Consume Modal: 
Rating stars (large, touch-friendly) 
Text area for tasting notes 
Date, occasion, food pairing fields 
Updates stock count automatically 
5. PWA & Offline Features
Service worker for offline functionality 
IndexedDB for local data storage 
Image caching with size management 
Background sync for offline actions 
App manifest for installability 
Offline indicator in UI 
Queue offline actions and sync when online 
6. Mobile Optimizations
Touch targets minimum 44px 
Swipe gestures for navigation 
Haptic feedback for interactions 
Lazy loading for images 
Virtual scrolling for large lists 
Responsive images with WebP support 
Bottom sheet modals instead of popups 
Voice input for search and notes 
7. Gemini API Integration
javascript
// Example structure for Gemini integration
const extractWineData = async (imageBase64) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  // Phase 1: Extract text from label
  const extractionPrompt = `Extract all text from this wine label. 
    Include: wine name, producer, vintage, region, grape varieties, alcohol content`;
  
  const result1 = await model.generateContent([
    extractionPrompt,
    { inlineData: { data: imageBase64, mimeType: 'image/jpeg' }}
  ]);
  
  // Phase 2: Enrich with sommelier knowledge
  const enrichmentPrompt = `Given this wine: ${result1.response.text()}, 
    provide: tasting notes, food pairings, optimal drinking window, 
    serving temperature, and any notable characteristics`;
  
  const result2 = await model.generateContent(enrichmentPrompt);
  
  return { extracted: result1.response.text(), enriched: result2.response.text() };
};
8. Key UI/UX Principles
Mobile-first: Design for phone screens first 
Fast interactions: Optimistic updates, skeleton loaders 
Clear feedback: Loading states, success/error messages 
Intuitive: Follow iOS/Android design patterns 
Accessible: High contrast, screen reader support 
Elegant: Wine-appropriate color scheme (deep reds, burgundy, gold accents) 
Initial MVP Scope
Start with these core features:
1. Google authentication 
2. Add wine via photo with AI extraction 
3. View cellar (grid view) 
4. Wine detail view 
5. Consume wine & log tasting notes 
6. Basic offline support 
Environment Variables Needed
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
Design Notes
Color scheme: Deep burgundy (#722F37), gold (#FFD700), cream (#FFF8DC), charcoal (#36454F) 
Typography: Elegant serif for headings, clean sans-serif for body 
Icons: Use Lucide React icons 
Loading states: Wine glass filling animation 
Empty states: Friendly messages encouraging first bottle add 
Build this as a production-ready PWA with focus on mobile usability, fast performance, and elegant design befitting a wine enthusiast application. Ensure all CRUD operations work with Supabase, implement proper error handling, and create a smooth, app-like experience.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ask1get2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7a15c32e-a3cd-49f0-ae5a-a939f3e6ae33).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
