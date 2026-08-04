/**
 * Supabase 데이터베이스 타입.
 *
 * ⚠️ 현재는 손으로 관리한다. Supabase 프로젝트를 연결한 뒤에는
 *      npm run db:types
 *    로 실제 스키마에서 생성한 타입으로 이 파일을 교체할 것.
 *
 * Phase 0 범위(프로필·동의·지표)를 정확히 담고, 이후 Phase 에서 쓰는
 * 테이블은 스키마와 함께 채워 나간다.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type BiologicalSex = "male" | "female" | "unspecified";

export type ConsentKind =
  | "terms_of_service"
  | "privacy_policy"
  | "sensitive_health_data"
  | "llm_processing"
  | "marketing";

export type MetricCategory =
  | "body"
  | "vital"
  | "glucose"
  | "lipid"
  | "liver"
  | "kidney"
  | "blood"
  | "thyroid"
  | "urine"
  | "lifestyle";

export type MetricSource = "self" | "checkup" | "device" | "derived";

export type ExtractionStatus = "pending" | "running" | "review" | "confirmed" | "failed";

export type ExtractionItemStatus = "pending" | "accepted" | "edited" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          birth_year: number | null;
          sex: BiologicalSex;
          height_cm: number | null;
          timezone: string;
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          birth_year?: number | null;
          sex?: BiologicalSex;
          height_cm?: number | null;
          timezone?: string;
          onboarded_at?: string | null;
        };
        Update: {
          display_name?: string | null;
          birth_year?: number | null;
          sex?: BiologicalSex;
          height_cm?: number | null;
          timezone?: string;
          onboarded_at?: string | null;
        };
        Relationships: [];
      };

      consent_documents: {
        Row: {
          id: string;
          kind: ConsentKind;
          version: string;
          title: string;
          body: string;
          is_required: boolean;
          effective_from: string;
          retired_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      user_consents: {
        Row: {
          id: string;
          user_id: string;
          consent_document_id: string;
          granted: boolean;
          granted_at: string;
          revoked_at: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          consent_document_id: string;
          granted: boolean;
          user_agent?: string | null;
        };
        Update: never;
        Relationships: [];
      };

      metric_definitions: {
        Row: {
          code: string;
          display_name: string;
          short_name: string | null;
          unit: string;
          category: MetricCategory;
          decimal_places: number;
          min_valid: number | null;
          max_valid: number | null;
          higher_is_better: boolean | null;
          loinc_code: string | null;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      metric_reference_ranges: {
        Row: {
          id: string;
          metric_code: string;
          sex: BiologicalSex | null;
          age_min: number | null;
          age_max: number | null;
          normal_low: number | null;
          normal_high: number | null;
          caution_low: number | null;
          caution_high: number | null;
          source: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      health_metrics: {
        Row: {
          id: string;
          user_id: string;
          metric_code: string;
          value: number;
          unit: string;
          measured_at: string;
          source: MetricSource;
          source_ref: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          metric_code: string;
          value: number;
          unit: string;
          measured_at: string;
          source?: MetricSource;
          source_ref?: string | null;
          note?: string | null;
        };
        Update: {
          value?: number;
          unit?: string;
          measured_at?: string;
          note?: string | null;
        };
        Relationships: [];
      };
    };

    Views: Record<never, never>;

    Functions: {
      has_required_consents: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      current_consent_documents: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          kind: ConsentKind;
          version: string;
          title: string;
          body: string;
          is_required: boolean;
          granted: boolean;
        }[];
      };
    };

    Enums: {
      biological_sex: BiologicalSex;
      consent_kind: ConsentKind;
      metric_category: MetricCategory;
      metric_source: MetricSource;
      extraction_status: ExtractionStatus;
      extraction_item_status: ExtractionItemStatus;
    };

    CompositeTypes: Record<never, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = Tables<"profiles">;
export type MetricDefinition = Tables<"metric_definitions">;
export type MetricReferenceRange = Tables<"metric_reference_ranges">;
export type HealthMetric = Tables<"health_metrics">;
export type ConsentDocument = Tables<"consent_documents">;
