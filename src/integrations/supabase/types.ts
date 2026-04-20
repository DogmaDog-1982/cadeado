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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      games: {
        Row: {
          code: string
          created_at: string
          current_position_for_p1: number
          current_position_for_p2: number
          current_turn: number
          id: string
          player1_guesses: Json
          player1_name: string | null
          player1_secret: number[]
          player2_guesses: Json
          player2_name: string | null
          player2_secret: number[]
          status: string
          updated_at: string
          winner: number | null
        }
        Insert: {
          code: string
          created_at?: string
          current_position_for_p1?: number
          current_position_for_p2?: number
          current_turn?: number
          id?: string
          player1_guesses?: Json
          player1_name?: string | null
          player1_secret: number[]
          player2_guesses?: Json
          player2_name?: string | null
          player2_secret: number[]
          status?: string
          updated_at?: string
          winner?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          current_position_for_p1?: number
          current_position_for_p2?: number
          current_turn?: number
          id?: string
          player1_guesses?: Json
          player1_name?: string | null
          player1_secret?: number[]
          player2_guesses?: Json
          player2_name?: string | null
          player2_secret?: number[]
          status?: string
          updated_at?: string
          winner?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      games_public: {
        Row: {
          code: string | null
          created_at: string | null
          current_position_for_p1: number | null
          current_position_for_p2: number | null
          current_turn: number | null
          id: string | null
          player1_guesses: Json | null
          player1_name: string | null
          player2_guesses: Json | null
          player2_name: string | null
          status: string | null
          updated_at: string | null
          winner: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          current_position_for_p1?: number | null
          current_position_for_p2?: number | null
          current_turn?: number | null
          id?: string | null
          player1_guesses?: Json | null
          player1_name?: string | null
          player2_guesses?: Json | null
          player2_name?: string | null
          status?: string | null
          updated_at?: string | null
          winner?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          current_position_for_p1?: number | null
          current_position_for_p2?: number | null
          current_turn?: number | null
          id?: string | null
          player1_guesses?: Json | null
          player1_name?: string | null
          player2_guesses?: Json | null
          player2_name?: string | null
          status?: string | null
          updated_at?: string | null
          winner?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      join_game: {
        Args: { _code: string; _name: string; _secret: number[] }
        Returns: string
      }
      make_guess: {
        Args: { _game_id: string; _guess: number; _player: number }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
