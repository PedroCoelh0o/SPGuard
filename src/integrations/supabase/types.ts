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
      audit_exportacoes: {
        Row: {
          created_at: string
          filtros: Json
          id: string
          modulo: string
          tipo: string
          total_registros: number
          user_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filtros?: Json
          id?: string
          modulo?: string
          tipo: string
          total_registros?: number
          user_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          filtros?: Json
          id?: string
          modulo?: string
          tipo?: string
          total_registros?: number
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      colaborador_documentos: {
        Row: {
          colaborador_id: string
          created_at: string
          id: string
          nome: string
          storage_path: string
          tamanho: number | null
          tipo: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          id?: string
          nome: string
          storage_path: string
          tamanho?: number | null
          tipo?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          id?: string
          nome?: string
          storage_path?: string
          tamanho?: number | null
          tipo?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          bairro: string | null
          cargo: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          empresa_id: string
          escolaridade: string | null
          estado: string | null
          foto_url: string | null
          id: string
          matricula: string | null
          motivo_desligamento: string | null
          nome: string
          numero: string | null
          rg: string | null
          rua: string | null
          setor: string | null
          sexo: string | null
          status: string
          telefone: string | null
          turno: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cargo?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id: string
          escolaridade?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          matricula?: string | null
          motivo_desligamento?: string | null
          nome: string
          numero?: string | null
          rg?: string | null
          rua?: string | null
          setor?: string | null
          sexo?: string | null
          status?: string
          telefone?: string | null
          turno?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cargo?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id?: string
          escolaridade?: string | null
          estado?: string | null
          foto_url?: string | null
          id?: string
          matricula?: string | null
          motivo_desligamento?: string | null
          nome?: string
          numero?: string | null
          rg?: string | null
          rua?: string | null
          setor?: string | null
          sexo?: string | null
          status?: string
          telefone?: string | null
          turno?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      eletronicos: {
        Row: {
          acessorios: string | null
          colaborador_id: string
          contato: string | null
          created_at: string
          descricao: string | null
          id: string
          imei: string | null
          modelo: string | null
          numero_selo: string | null
          numero_serie: string | null
          tipo: Database["public"]["Enums"]["eletronico_tipo"]
          updated_at: string
        }
        Insert: {
          acessorios?: string | null
          colaborador_id: string
          contato?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          imei?: string | null
          modelo?: string | null
          numero_selo?: string | null
          numero_serie?: string | null
          tipo: Database["public"]["Enums"]["eletronico_tipo"]
          updated_at?: string
        }
        Update: {
          acessorios?: string | null
          colaborador_id?: string
          contato?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          imei?: string | null
          modelo?: string | null
          numero_selo?: string | null
          numero_serie?: string | null
          tipo?: Database["public"]["Enums"]["eletronico_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletronicos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome_fantasia: string | null
          razao_social: string
          responsavel: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          responsavel?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          responsavel?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
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
      can_write: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "consulta"
      eletronico_tipo: "celular" | "notebook" | "tablet"
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
      app_role: ["admin", "supervisor", "consulta"],
      eletronico_tipo: ["celular", "notebook", "tablet"],
    },
  },
} as const
