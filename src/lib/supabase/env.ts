/**
 * Supabase 접속 정보.
 *
 * Supabase 는 anon key 를 publishable key 로 이름을 바꾸는 중이라
 * 프로젝트 생성 시점에 따라 둘 중 하나가 발급된다. 양쪽을 모두 받는다.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `환경변수 ${name} 이 설정되지 않았습니다. .env.example 을 참고해 .env.local 을 만들어 주세요.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
}
