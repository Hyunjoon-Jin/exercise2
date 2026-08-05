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

export type MedicationForm =
  | "tablet"
  | "capsule"
  | "liquid"
  | "injection"
  | "topical"
  | "inhaler"
  | "other";

export type MedicationLogStatus = "taken" | "skipped" | "missed";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type WorkoutIntensity = "light" | "moderate" | "vigorous";

/** medication_doses_for_date() 반환 행 — 스케줄에서 전개된 그 날의 예정 복용 */
export interface MedicationDose {
  schedule_id: string;
  medication_id: string;
  medication_name: string;
  dosage_amount: number | null;
  dosage_unit: string | null;
  time_of_day: string;
  quantity: number;
  scheduled_for: string;
  log_id: string | null;
  status: MedicationLogStatus | null;
}

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
          weekly_exercise_goal_min: number | null;
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
          weekly_exercise_goal_min?: number | null;
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

      sleep_records: {
        Row: {
          id: string;
          user_id: string;
          sleep_date: string;
          bed_time: string | null;
          wake_time: string | null;
          duration_min: number | null;
          quality: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          sleep_date: string;
          bed_time?: string | null;
          wake_time?: string | null;
          duration_min?: number | null;
          quality?: number | null;
          note?: string | null;
        };
        Update: {
          bed_time?: string | null;
          wake_time?: string | null;
          duration_min?: number | null;
          quality?: number | null;
          note?: string | null;
        };
        Relationships: [];
      };

      medications: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          dosage_amount: number | null;
          dosage_unit: string | null;
          form: MedicationForm;
          purpose: string | null;
          started_on: string | null;
          ended_on: string | null;
          is_active: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          dosage_amount?: number | null;
          dosage_unit?: string | null;
          form?: MedicationForm;
          purpose?: string | null;
          started_on?: string | null;
          ended_on?: string | null;
          note?: string | null;
        };
        Update: {
          name?: string;
          dosage_amount?: number | null;
          dosage_unit?: string | null;
          form?: MedicationForm;
          purpose?: string | null;
          started_on?: string | null;
          ended_on?: string | null;
          is_active?: boolean;
          note?: string | null;
        };
        Relationships: [];
      };

      medication_schedules: {
        Row: {
          id: string;
          medication_id: string;
          user_id: string;
          time_of_day: string;
          days_of_week: number[];
          quantity: number;
          reminder_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          medication_id: string;
          user_id: string;
          time_of_day: string;
          days_of_week?: number[];
          quantity?: number;
          reminder_enabled?: boolean;
        };
        Update: {
          time_of_day?: string;
          days_of_week?: number[];
          quantity?: number;
          reminder_enabled?: boolean;
        };
        Relationships: [];
      };

      medication_logs: {
        Row: {
          id: string;
          user_id: string;
          medication_id: string;
          schedule_id: string | null;
          scheduled_for: string;
          taken_at: string | null;
          status: MedicationLogStatus;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          medication_id: string;
          schedule_id?: string | null;
          scheduled_for: string;
          taken_at?: string | null;
          status: MedicationLogStatus;
          note?: string | null;
        };
        Update: {
          taken_at?: string | null;
          status?: MedicationLogStatus;
          note?: string | null;
        };
        Relationships: [];
      };

      foods: {
        Row: {
          code: string;
          name: string;
          brand: string | null;
          source: string;
          serving_size: number;
          serving_unit: string;
          kcal: number | null;
          carb_g: number | null;
          protein_g: number | null;
          fat_g: number | null;
          sugar_g: number | null;
          sodium_mg: number | null;
          fiber_g: number | null;
          search_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      user_foods: {
        Row: {
          code: string;
          user_id: string;
          name: string;
          brand: string | null;
          serving_size: number;
          serving_unit: string;
          kcal: number | null;
          carb_g: number | null;
          protein_g: number | null;
          fat_g: number | null;
          sugar_g: number | null;
          sodium_mg: number | null;
          fiber_g: number | null;
          use_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          user_id: string;
          name: string;
          brand?: string | null;
          serving_size?: number;
          serving_unit?: string;
          kcal?: number | null;
          carb_g?: number | null;
          protein_g?: number | null;
          fat_g?: number | null;
          sugar_g?: number | null;
          sodium_mg?: number | null;
          fiber_g?: number | null;
        };
        Update: {
          name?: string;
          use_count?: number;
        };
        Relationships: [];
      };

      meals: {
        Row: {
          id: string;
          user_id: string;
          meal_type: MealType;
          eaten_at: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          meal_type: MealType;
          eaten_at: string;
          note?: string | null;
        };
        Update: { meal_type?: MealType; eaten_at?: string; note?: string | null };
        Relationships: [];
      };

      meal_items: {
        Row: {
          id: string;
          meal_id: string;
          user_id: string;
          food_code: string | null;
          custom_name: string | null;
          quantity: number;
          unit: string;
          kcal: number | null;
          carb_g: number | null;
          protein_g: number | null;
          fat_g: number | null;
          created_at: string;
        };
        Insert: {
          meal_id: string;
          user_id: string;
          food_code?: string | null;
          custom_name?: string | null;
          quantity?: number;
          unit?: string;
          kcal?: number | null;
          carb_g?: number | null;
          protein_g?: number | null;
          fat_g?: number | null;
        };
        Update: never;
        // meals.select("*, meal_items(*)") 로 한 번에 읽으려면
        // PostgREST 가 관계를 알아야 한다.
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey";
            columns: ["meal_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id"];
          },
        ];
      };

      exercises: {
        Row: {
          code: string;
          name: string;
          category: string;
          met: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      workouts: {
        Row: {
          id: string;
          user_id: string;
          exercise_code: string | null;
          custom_name: string | null;
          started_at: string;
          duration_min: number;
          intensity: WorkoutIntensity;
          calories_burned: number | null;
          distance_km: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          exercise_code?: string | null;
          custom_name?: string | null;
          started_at: string;
          duration_min: number;
          intensity?: WorkoutIntensity;
          calories_burned?: number | null;
          distance_km?: number | null;
          note?: string | null;
        };
        Update: {
          duration_min?: number;
          intensity?: WorkoutIntensity;
          calories_burned?: number | null;
          note?: string | null;
        };
        Relationships: [];
      };

      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          failure_count: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
        };
        Update: {
          failure_count?: number;
          last_used_at?: string | null;
        };
        Relationships: [];
      };

      checkups: {
        Row: {
          id: string;
          user_id: string;
          checkup_date: string;
          institution: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          checkup_date: string;
          institution?: string | null;
          note?: string | null;
        };
        Update: {
          checkup_date?: string;
          institution?: string | null;
          note?: string | null;
        };
        Relationships: [];
      };

      checkup_documents: {
        Row: {
          id: string;
          checkup_id: string;
          user_id: string;
          storage_path: string;
          file_name: string | null;
          mime_type: string;
          size_bytes: number | null;
          page_count: number | null;
          created_at: string;
        };
        Insert: {
          checkup_id: string;
          user_id: string;
          storage_path: string;
          file_name?: string | null;
          mime_type: string;
          size_bytes?: number | null;
          page_count?: number | null;
        };
        Update: never;
        Relationships: [];
      };

      checkup_extractions: {
        Row: {
          id: string;
          checkup_id: string;
          document_id: string;
          user_id: string;
          model: string;
          status: ExtractionStatus;
          raw_output: Json | null;
          input_tokens: number | null;
          output_tokens: number | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          checkup_id: string;
          document_id: string;
          user_id: string;
          model: string;
          status?: ExtractionStatus;
          started_at?: string | null;
        };
        Update: {
          status?: ExtractionStatus;
          raw_output?: Json | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          error_message?: string | null;
          completed_at?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };

      checkup_extraction_items: {
        Row: {
          id: string;
          extraction_id: string;
          user_id: string;
          raw_label: string;
          raw_value: string | null;
          raw_unit: string | null;
          reference_range: string | null;
          confidence: number | null;
          page_number: number | null;
          metric_code: string | null;
          value: number | null;
          unit: string | null;
          status: ExtractionItemStatus;
          health_metric_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          extraction_id: string;
          user_id: string;
          raw_label: string;
          raw_value?: string | null;
          raw_unit?: string | null;
          reference_range?: string | null;
          confidence?: number | null;
          page_number?: number | null;
          metric_code?: string | null;
          value?: number | null;
          unit?: string | null;
          status?: ExtractionItemStatus;
        };
        Update: {
          metric_code?: string | null;
          value?: number | null;
          unit?: string | null;
          status?: ExtractionItemStatus;
        };
        Relationships: [];
      };

      /** service_role 전용. 사용자 세션에는 정책이 없어 아무 행도 보이지 않는다. */
      storage_cleanup_queue: {
        Row: {
          id: string;
          bucket_id: string;
          storage_path: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: never;
        Update: { deleted_at?: string | null };
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
      latest_metrics: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          metric_code: string;
          value: number;
          unit: string;
          measured_at: string;
          source: MetricSource;
        }[];
      };
      medication_doses_for_date: {
        Args: { target_date: string };
        Returns: MedicationDose[];
      };
      medication_adherence: {
        Args: { days?: number };
        Returns: number | null;
      };
      /** 스케줄러 전용 (service_role). 사용자 세션에서는 호출 권한이 없다. */
      due_medication_reminders: {
        Args: { window_minutes?: number };
        Returns: {
          subscription_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          medication_id: string;
          medication_name: string;
          dosage_amount: number | null;
          dosage_unit: string | null;
          schedule_id: string;
          scheduled_for: string;
        }[];
      };
      mark_push_failure: {
        Args: { subscription_endpoint: string };
        Returns: undefined;
      };
      mark_push_success: {
        Args: { subscription_endpoint: string };
        Returns: undefined;
      };
      cache_foods: {
        Args: { items: Json };
        Returns: number;
      };
      daily_nutrition_summary: {
        Args: { target_date: string };
        Returns: {
          kcal: number;
          carb_g: number;
          protein_g: number;
          fat_g: number;
          meal_count: number;
        }[];
      };
      weekly_exercise_summary: {
        Args: Record<string, never>;
        Returns: {
          total_min: number;
          total_calories: number;
          session_count: number;
          goal_min: number | null;
        }[];
      };
      /** 승격된 항목 수를 돌려준다. 검수를 거치지 않은 항목은 세지 않는다. */
      confirm_checkup_extraction: {
        Args: { p_extraction_id: string };
        Returns: number;
      };
      revert_checkup_extraction: {
        Args: { p_extraction_id: string };
        Returns: number;
      };
      checkup_summaries: {
        Args: Record<string, never>;
        Returns: {
          checkup_id: string;
          checkup_date: string;
          institution: string | null;
          document_count: number;
          extraction_id: string | null;
          status: ExtractionStatus | null;
          item_count: number;
          confirmed_count: number;
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
export type SleepRecord = Tables<"sleep_records">;
export type Medication = Tables<"medications">;
export type MedicationSchedule = Tables<"medication_schedules">;
export type MedicationLog = Tables<"medication_logs">;
export type Checkup = Tables<"checkups">;
export type CheckupDocument = Tables<"checkup_documents">;
export type CheckupExtraction = Tables<"checkup_extractions">;
export type CheckupExtractionItem = Tables<"checkup_extraction_items">;
