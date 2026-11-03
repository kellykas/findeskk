export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
  | { [key: string]: Json | undefined }[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          id: number;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          id?: number;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          id?: number;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          description: string;
          id: string;
          is_system: boolean;
          name: string;
          normal_balance: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          name: string;
          normal_balance: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          description?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
          normal_balance?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      branch_assignments: {
        Row: {
          branch_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_assignments_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          active: boolean;
          address: string;
          code: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          branch_id: string | null;
          created_at: string;
          created_by: string;
          description: string;
          entry_date: string;
          entry_type: string;
          id: string;
          idempotency_key: string | null;
          reference: string;
          reverses_entry_id: string | null;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          created_by: string;
          description: string;
          entry_date: string;
          entry_type?: string;
          id?: string;
          idempotency_key?: string | null;
          reference: string;
          reverses_entry_id?: string | null;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string;
          entry_date?: string;
          entry_type?: string;
          id?: string;
          idempotency_key?: string | null;
          reference?: string;
          reverses_entry_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey";
            columns: ["reverses_entry_id"];
            isOneToOne: true;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_lines: {
        Row: {
          account_id: string;
          amount: number;
          branch_id: string | null;
          entry_id: string;
          id: string;
          memo: string;
          side: string;
        };
        Insert: {
          account_id: string;
          amount: number;
          branch_id?: string | null;
          entry_id: string;
          id?: string;
          memo?: string;
          side: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          branch_id?: string | null;
          entry_id?: string;
          id?: string;
          memo?: string;
          side?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          display_name?: string;
          email?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      company_settings: {
        Row: {
          address: string;
          base_currency: string;
          company_name: string;
          currency_codes: string[];
          email: string;
          fiscal_year_start_month: number;
          id: boolean;
          legal_name: string;
          phone: string;
          receipt_footer: string;
          receipt_format: string;
          tax_number: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          address?: string;
          base_currency?: string;
          company_name?: string;
          currency_codes?: string[];
          email?: string;
          fiscal_year_start_month?: number;
          id?: boolean;
          legal_name?: string;
          phone?: string;
          receipt_footer?: string;
          receipt_format?: string;
          tax_number?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address?: string;
          base_currency?: string;
          company_name?: string;
          currency_codes?: string[];
          email?: string;
          fiscal_year_start_month?: number;
          id?: boolean;
          legal_name?: string;
          phone?: string;
          receipt_footer?: string;
          receipt_format?: string;
          tax_number?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          active: boolean;
          branch_id: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          email: string;
          id: string;
          id_number: string;
          id_type: string;
          name: string;
          notes: string;
          phone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          branch_id?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          id?: string;
          id_number?: string;
          id_type?: string;
          name: string;
          notes?: string;
          phone?: string;
        };
        Update: {
          active?: boolean;
          branch_id?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          id?: string;
          id_number?: string;
          id_type?: string;
          name?: string;
          notes?: string;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount: number;
          branch_id: string;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          expense_date: string;
          id: string;
          idempotency_key: string | null;
          journal_entry_id: string | null;
          notes: string;
          paid_from: string;
          reference: string;
        };
        Insert: {
          amount: string | number;
          branch_id: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          expense_date?: string;
          id?: string;
          idempotency_key?: string | null;
          journal_entry_id?: string | null;
          notes?: string;
          paid_from?: string;
          reference?: string;
        };
        Update: {
          amount?: string | number;
          branch_id?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          expense_date?: string;
          id?: string;
          idempotency_key?: string | null;
          journal_entry_id?: string | null;
          notes?: string;
          paid_from?: string;
          reference?: string;
        };
        Relationships: [];
      };
      incomes: {
        Row: {
          amount: number;
          branch_id: string;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          idempotency_key: string | null;
          income_date: string;
          journal_entry_id: string | null;
          notes: string;
          received_into: string;
          reference: string;
        };
        Insert: {
          amount: string | number;
          branch_id: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          idempotency_key?: string | null;
          income_date?: string;
          journal_entry_id?: string | null;
          notes?: string;
          received_into?: string;
          reference?: string;
        };
        Update: {
          amount?: string | number;
          branch_id?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          idempotency_key?: string | null;
          income_date?: string;
          journal_entry_id?: string | null;
          notes?: string;
          received_into?: string;
          reference?: string;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          buy_rate: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          effective_from: string;
          id: string;
          sell_rate: number;
        };
        Insert: {
          buy_rate: string | number;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          effective_from?: string;
          id?: string;
          sell_rate: string | number;
        };
        Update: {
          buy_rate?: string | number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_from?: string;
          id?: string;
          sell_rate?: string | number;
        };
        Relationships: [];
      };
      fx_transactions: {
        Row: {
          branch_id: string;
          cost_amount: number;
          cost_rate: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          entry_date: string;
          foreign_amount: number;
          id: string;
          journal_entry_id: string | null;
          margin: number;
          notes: string;
          rate: number;
          receipt_no: string;
          settlement: string;
          type: string;
          ugx_amount: number;
          customer_ref: string;
        };
        Insert: {
          branch_id: string;
          cost_amount: string | number;
          cost_rate: string | number;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          entry_date?: string;
          foreign_amount: string | number;
          id?: string;
          journal_entry_id?: string | null;
          margin: string | number;
          notes?: string;
          rate: string | number;
          receipt_no?: string;
          settlement?: string;
          type: string;
          ugx_amount: string | number;
          customer_ref?: string;
        };
        Update: {
          branch_id?: string;
          cost_amount?: string | number;
          cost_rate?: string | number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          entry_date?: string;
          foreign_amount?: string | number;
          id?: string;
          journal_entry_id?: string | null;
          margin?: string | number;
          notes?: string;
          rate?: string | number;
          receipt_no?: string;
          settlement?: string;
          type?: string;
          ugx_amount?: string | number;
          customer_ref?: string;
        };
        Relationships: [];
      };
      currency_transfers: {
        Row: {
          id: string;
          currency: string;
          amount: number;
          from_branch_id: string;
          to_branch_id: string;
          reference: string;
          notes: string;
          entry_date: string;
          journal_entry_id: string | null;
          idempotency_key: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          currency: string;
          amount: string | number;
          from_branch_id: string;
          to_branch_id: string;
          reference?: string;
          notes?: string;
          entry_date?: string;
          journal_entry_id?: string | null;
          idempotency_key?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          currency?: string;
          amount?: string | number;
          from_branch_id?: string;
          to_branch_id?: string;
          reference?: string;
          notes?: string;
          entry_date?: string;
          journal_entry_id?: string | null;
          idempotency_key?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      momo_transactions: {
        Row: {
          amount: number;
          branch_id: string;
          commission: number;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          customer_ref: string;
          entry_date: string;
          id: string;
          idempotency_key: string | null;
          journal_entry_id: string | null;
          network: string;
          network_ref: string;
          notes: string;
          type: string;
        };
        Insert: {
          amount: string | number;
          branch_id: string;
          commission?: string | number;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          customer_ref?: string;
          entry_date?: string;
          id?: string;
          idempotency_key?: string | null;
          journal_entry_id?: string | null;
          network: string;
          network_ref?: string;
          notes?: string;
          type: string;
        };
        Update: {
          amount?: string | number;
          branch_id?: string;
          commission?: string | number;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          customer_ref?: string;
          entry_date?: string;
          id?: string;
          idempotency_key?: string | null;
          journal_entry_id?: string | null;
          network?: string;
          network_ref?: string;
          notes?: string;
          type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_id: string | null;
          active: boolean | null;
          balance: number | null;
          code: string | null;
          name: string | null;
          normal_balance: string | null;
          total_credit: number | null;
          total_debit: number | null;
          type: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_initial_admin: {
        Args: never;
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff_admin: { Args: never; Returns: boolean };
      post_journal_entry: {
        Args: {
          _branch_id: string | null;
          _description: string;
          _entry_date: string;
          _entry_type: string;
          _idempotency_key?: string | null;
          _lines: Json;
          _reverses_entry_id?: string | null;
        };
        Returns: string;
      };
      save_staff_access: {
        Args: {
          _active: boolean;
          _branches: string[];
          _display_name: string;
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: undefined;
      };
      record_momo_transaction: {
        Args: {
          _branch_id: string;
          _commission: string | number;
          _customer_id?: string | null;
          _customer_ref?: string;
          _entry_date?: string;
          _idempotency_key?: string | null;
          _notes?: string;
          _network: string;
          _network_ref?: string;
          _type: string;
          _amount: string | number;
        };
        Returns: string;
      };
      record_expense: {
        Args: {
          _amount: string | number;
          _branch_id: string;
          _category: string;
          _description: string;
          _expense_date: string;
          _idempotency_key?: string | null;
          _notes?: string;
          _paid_from: string;
          _reference?: string;
        };
        Returns: string;
      };
      record_income: {
        Args: {
          _amount: string | number;
          _branch_id: string;
          _category: string;
          _description: string;
          _income_date: string;
          _idempotency_key?: string | null;
          _notes?: string;
          _received_into: string;
          _reference?: string;
        };
        Returns: string;
      };
      record_fx_transaction: {
        Args: {
          _branch_id: string;
          _cost_rate: string | number;
          _customer_ref?: string;
          _entry_date?: string;
          _idempotency_key?: string | null;
          _notes?: string;
          _receipt_no?: string;
          _rate: string | number;
          _settlement: string;
          _type: string;
          _currency: string;
          _foreign_amount: string | number;
        };
        Returns: string;
      };
      record_currency_transfer: {
        Args: {
          _currency: string;
          _amount: string | number;
          _from_branch_id: string;
          _to_branch_id: string;
          _reference?: string;
          _notes?: string;
          _entry_date?: string;
          _idempotency_key?: string | null;
        };
        Returns: string;
      };
    };
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
        | "auditor";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  ParentTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals } = never,
  TableName extends (ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : ParentTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[ParentTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  ParentTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals } = never,
  TableName extends (ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"]
    : keyof DefaultSchema["Tables"]) = never,
> = ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchema["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never;

export type TablesUpdate<
  ParentTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals } = never,
  TableName extends (ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"]
    : keyof DefaultSchema["Tables"]) = never,
> = ParentTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[ParentTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchema["Tables"][TableName] extends { Update: infer U }
    ? U
    : never;

export type Enums<
  EnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals } = never,
  EnumName extends (EnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[EnumNameOrOptions["schema"]]["Enums"]
    : keyof DefaultSchema["Enums"]) = never,
> = EnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[EnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchema["Enums"][EnumName];

// The public schema defines no composite types; the generated helper would
// otherwise index an empty object and fail to compile.
export type CompositeTypes<
  _CompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals } = never,
  _CompositeTypeName extends string = never,
> = never;

const ConstantsTable = {
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
};
