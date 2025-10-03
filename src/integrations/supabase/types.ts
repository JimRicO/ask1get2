export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tasting_notes: {
        Row: {
          created_at: string | null
          food_pairing: string | null
          id: string
          notes: string | null
          occasion: string | null
          rating: number | null
          tasting_date: string | null
          user_id: string
          wine_id: string
        }
        Insert: {
          created_at?: string | null
          food_pairing?: string | null
          id?: string
          notes?: string | null
          occasion?: string | null
          rating?: number | null
          tasting_date?: string | null
          user_id: string
          wine_id: string
        }
        Update: {
          created_at?: string | null
          food_pairing?: string | null
          id?: string
          notes?: string | null
          occasion?: string | null
          rating?: number | null
          tasting_date?: string | null
          user_id?: string
          wine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasting_notes_wine_id_fkey"
            columns: ["wine_id"]
            isOneToOne: false
            referencedRelation: "wines"
            referencedColumns: ["id"]
          },
        ]
      }
      wines: {
        Row: {
          ai_food_pairings: string[] | null
          ai_tasting_notes: string | null
          alcohol_content: number | null
          appellation: string | null
          country: string | null
          created_at: string | null
          critic_scores: Json | null
          current_stock: number | null
          description: string | null
          grape_varietals: Json | null
          id: string
          images: Json | null
          notes: string | null
          optimal_drinking_window: string | null
          price_per_bottle: number | null
          producer: string | null
          region: string | null
          storage_location: string | null
          updated_at: string | null
          user_id: string
          vintage_year: number | null
          wine_name: string
          wine_type: Database["public"]["Enums"]["wine_type"] | null
        }
        Insert: {
          ai_food_pairings?: string[] | null
          ai_tasting_notes?: string | null
          alcohol_content?: number | null
          appellation?: string | null
          country?: string | null
          created_at?: string | null
          critic_scores?: Json | null
          current_stock?: number | null
          description?: string | null
          grape_varietals?: Json | null
          id?: string
          images?: Json | null
          notes?: string | null
          optimal_drinking_window?: string | null
          price_per_bottle?: number | null
          producer?: string | null
          region?: string | null
          storage_location?: string | null
          updated_at?: string | null
          user_id: string
          vintage_year?: number | null
          wine_name: string
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Update: {
          ai_food_pairings?: string[] | null
          ai_tasting_notes?: string | null
          alcohol_content?: number | null
          appellation?: string | null
          country?: string | null
          created_at?: string | null
          critic_scores?: Json | null
          current_stock?: number | null
          description?: string | null
          grape_varietals?: Json | null
          id?: string
          images?: Json | null
          notes?: string | null
          optimal_drinking_window?: string | null
          price_per_bottle?: number | null
          producer?: string | null
          region?: string | null
          storage_location?: string | null
          updated_at?: string | null
          user_id?: string
          vintage_year?: number | null
          wine_name?: string
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      wine_type:
        | "red"
        | "white"
        | "rose"
        | "sparkling"
        | "dessert"
        | "fortified"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      wine_type: ["red", "white", "rose", "sparkling", "dessert", "fortified"],
    },
  },
} as const
