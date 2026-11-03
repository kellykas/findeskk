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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
          normal_balance: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name: string
          normal_balance: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name?: string
          normal_balance?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      branch_assignments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string
          base_currency: string
          company_name: string
          currency_codes: string[]
          email: string
          fiscal_year_start_month: number
          id: boolean
          legal_name: string
          phone: string
          receipt_footer: string
          receipt_format: string
          tax_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string
          base_currency?: string
          company_name?: string
          currency_codes?: string[]
          email?: string
          fiscal_year_start_month?: number
          id?: boolean
          legal_name?: string
          phone?: string
          receipt_footer?: string
          receipt_format?: string
          tax_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          base_currency?: string
          company_name?: string
          currency_codes?: string[]
          email?: string
          fiscal_year_start_month?: number
          id?: boolean
          legal_name?: string
          phone?: string
          receipt_footer?: string
          receipt_format?: string
          tax_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          active: boolean
          branch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          id_number: string
          id_type: string
          name: string
          notes: string
          phone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          id_number?: string
          id_type?: string
          name: string
          notes?: string
          phone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          id_number?: string
          id_type?: string
          name?: string
          notes?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          idempotency_key: string | null
          journal_entry_id: string | null
          notes: string
          paid_from: string
          reference: string
        }
        Insert: {
          amount: number
          branch_id: string
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          notes?: string
          paid_from?: string
          reference?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          notes?: string
          paid_from?: string
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          buy_rate: number
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          id: string
          sell_rate: number
        }
        Insert: {
          buy_rate: number
          created_at?: string
          created_by?: string | null
          currency: string
          effective_from?: string
          id?: string
          sell_rate: number
        }
        Update: {
          buy_rate?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          sell_rate?: number
        }
        Relationships: []
      }
      fx_transactions: {
        Row: {
          branch_id: string
          cost_amount: number
          cost_rate: number
          created_at: string
          created_by: string | null
          currency: string
          customer_ref: string
          entry_date: string
          foreign_amount: number
          id: string
          idempotency_key: string | null
          journal_entry_id: string | null
          margin: number
          notes: string
          rate: number
          receipt_no: string
          settlement: string
          type: string
          ugx_amount: number
        }
        Insert: {
          branch_id: string
          cost_amount: number
          cost_rate: number
          created_at?: string
          created_by?: string | null
          currency: string
          customer_ref?: string
          entry_date?: string
          foreign_amount: number
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          margin: number
          notes?: string
          rate: number
          receipt_no?: string
          settlement?: string
          type: string
          ugx_amount: number
        }
        Update: {
          branch_id?: string
          cost_amount?: number
          cost_rate?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_ref?: string
          entry_date?: string
          foreign_amount?: number
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          margin?: number
          notes?: string
          rate?: number
          receipt_no?: string
          settlement?: string
          type?: string
          ugx_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string
          description: string
          entry_date: string
          entry_type: string
          id: string
          idempotency_key: string | null
          reference: string
          reverses_entry_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by: string
          description: string
          entry_date: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          reference: string
          reverses_entry_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          reference?: string
          reverses_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: true
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          amount: number
          branch_id: string | null
          entry_id: string
          id: string
          memo: string
          side: string
        }
        Insert: {
          account_id: string
          amount: number
          branch_id?: string | null
          entry_id: string
          id?: string
          memo?: string
          side: string
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string | null
          entry_id?: string
          id?: string
          memo?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      momo_transactions: {
        Row: {
          amount: number
          branch_id: string
          commission: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_ref: string
          entry_date: string
          id: string
          idempotency_key: string | null
          journal_entry_id: string | null
          network: string
          network_ref: string
          notes: string
          type: string
        }
        Insert: {
          amount: number
          branch_id: string
          commission?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_ref?: string
          entry_date?: string
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          network: string
          network_ref?: string
          notes?: string
          type: string
        }
        Update: {
          amount?: number
          branch_id?: string
          commission?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_ref?: string
          entry_date?: string
          id?: string
          idempotency_key?: string | null
          journal_entry_id?: string | null
          network?: string
          network_ref?: string
          notes?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "momo_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "momo_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "momo_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          active: boolean | null
          balance: number | null
          code: string | null
          name: string | null
          normal_balance: string | null
          total_credit: number | null
          total_debit: number | null
          type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_initial_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff_admin: { Args: never; Returns: boolean }
      post_journal_entry: {
        Args: {
          _branch_id: string
          _description: string
          _entry_date: string
          _entry_type: string
          _idempotency_key?: string
          _lines: Json
          _reverses_entry_id?: string
        }
        Returns: string
      }
      record_expense: {
        Args: {
          _amount: number
          _branch_id: string
          _category: string
          _description: string
          _expense_date: string
          _idempotency_key?: string
          _notes?: string
          _paid_from: string
          _reference?: string
        }
        Returns: string
      }
      record_fx_transaction: {
        Args: {
          _branch_id: string
          _cost_rate: number
          _currency: string
          _customer_ref?: string
          _entry_date?: string
          _foreign_amount: number
          _idempotency_key?: string
          _notes?: string
          _rate: number
          _receipt_no?: string
          _settlement: string
          _type: string
        }
        Returns: string
      }
      record_momo_transaction: {
        Args: {
          _amount: number
          _branch_id: string
          _commission: number
          _customer_id?: string
          _customer_ref?: string
          _entry_date?: string
          _idempotency_key?: string
          _network: string
          _network_ref?: string
          _notes?: string
          _type: string
        }
        Returns: string
      }
      save_staff_access: {
        Args: {
          _active: boolean
          _branches: string[]
          _display_name: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "company_owner"
        | "general_manager"
        | "branch_manager"
        | "supervisor"
        | "forex_teller"
        | "mobile_money_teller"
        | "accountant"
        | "auditor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "super_admin",
        "company_owner",
        "general_manager",
        "branch_manager",
        "supervisor",
        "forex_teller",
        "mobile_money_teller",
        "accountant",
        "auditor",
      ],
    },
  },
} as const
