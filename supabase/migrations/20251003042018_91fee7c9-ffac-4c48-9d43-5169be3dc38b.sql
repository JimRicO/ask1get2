-- Create wine type enum
CREATE TYPE wine_type AS ENUM ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified');

-- Create wines table
CREATE TABLE wines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wine_name TEXT NOT NULL,
  producer TEXT,
  vintage_year INTEGER,
  wine_type wine_type,
  grape_varietals JSONB,
  country TEXT,
  region TEXT,
  appellation TEXT,
  alcohol_content DECIMAL(4,1),
  current_stock INTEGER DEFAULT 1 CHECK (current_stock >= 0),
  price_per_bottle DECIMAL(10,2),
  storage_location TEXT,
  
  -- AI enriched fields
  ai_tasting_notes TEXT,
  ai_food_pairings TEXT[],
  optimal_drinking_window TEXT,
  critic_scores JSONB,
  
  -- Images stored in Supabase Storage
  images JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tasting notes table
CREATE TABLE tasting_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tasting_date DATE DEFAULT CURRENT_DATE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  occasion TEXT,
  food_pairing TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user profiles table for additional user data
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wines
CREATE POLICY "Users can view own wines" ON wines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wines" ON wines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wines" ON wines
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wines" ON wines
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for tasting_notes
CREATE POLICY "Users can view own tasting notes" ON tasting_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasting notes" ON tasting_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasting notes" ON tasting_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasting notes" ON tasting_notes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create storage bucket for wine images
INSERT INTO storage.buckets (id, name, public)
VALUES ('wine-images', 'wine-images', true);

-- Storage policies for wine images
CREATE POLICY "Users can upload wine images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'wine-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view wine images" ON storage.objects
  FOR SELECT USING (bucket_id = 'wine-images');

CREATE POLICY "Users can update own wine images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'wine-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own wine images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'wine-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_wines_updated_at
  BEFORE UPDATE ON wines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();