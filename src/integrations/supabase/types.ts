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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      channel_stream_keys: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          stream_key: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          stream_key?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          stream_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_stream_keys_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_approved: boolean
          is_live: boolean
          is_suspended: boolean
          logo_url: string | null
          name: string
          owner_id: string | null
          stream_url: string | null
          subscriber_count: number
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_approved?: boolean
          is_live?: boolean
          is_suspended?: boolean
          logo_url?: string | null
          name: string
          owner_id?: string | null
          stream_url?: string | null
          subscriber_count?: number
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_approved?: boolean
          is_live?: boolean
          is_suspended?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          stream_url?: string | null
          subscriber_count?: number
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          church_name: string | null
          created_at: string
          display_name: string | null
          id: string
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          church_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          church_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sermon_report_replies: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          report_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          report_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sermon_report_replies_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "sermon_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      sermon_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string
          sermon_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id: string
          sermon_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          sermon_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sermons: {
        Row: {
          category: string
          channel_id: string
          created_at: string
          description: string | null
          duration: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          is_live: boolean
          preacher: string | null
          sermon_date: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          category?: string
          channel_id: string
          created_at?: string
          description?: string | null
          duration?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_live?: boolean
          preacher?: string | null
          sermon_date?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          category?: string
          channel_id?: string
          created_at?: string
          description?: string | null
          duration?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_live?: boolean
          preacher?: string | null
          sermon_date?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sermons_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_report: {
        Args: { _report_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_sermon_channel_owner: {
        Args: { _sermon_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
