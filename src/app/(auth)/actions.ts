"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

/**
 * Supabase 인증 오류를 사용자에게 보여줄 한국어 문구로 바꾼다.
 *
 * 원문을 그대로 노출하지 않는 이유가 하나 더 있다: "등록되지 않은 이메일"과
 * "비밀번호 불일치"를 구분해 보여주면 계정 존재 여부가 새어나간다.
 * 로그인 실패는 원인과 무관하게 한 가지 문구로 통일한다.
 */
function toKoreanAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (message.includes("Email not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.";
  }
  if (message.includes("User already registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (message.includes("Password should be")) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }
  if (message.includes("rate limit") || message.includes("Too many")) {
    return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 모두 입력해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: toKoreanAuthError(error.message) };
  }

  // 동의 여부에 따라 proxy 가 온보딩으로 다시 보낸다.
  const next = String(formData.get("next") ?? "/today");
  redirect(next.startsWith("/") ? next : "/today");
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 모두 입력해 주세요." };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (password !== passwordConfirm) {
    return { error: "비밀번호가 서로 다릅니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error) {
    return { error: toKoreanAuthError(error.message) };
  }

  // 이메일 인증이 켜져 있으면 세션이 바로 생기지 않는다.
  if (!data.session) {
    return {
      notice:
        "인증 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해 주세요.",
    };
  }

  redirect("/onboarding/consent");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
