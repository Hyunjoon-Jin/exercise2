"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

import { AuthFormField } from "@/components/auth-form-field";

import { signIn, type AuthFormState } from "../actions";

const INITIAL: AuthFormState = {};

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/today";
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
      <p className="mt-2 text-sm text-muted">기록을 이어서 관리해 보세요.</p>

      <form action={formAction} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next} />

        <AuthFormField
          label="이메일"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <AuthFormField
          label="비밀번호"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {state.error ? (
          <p role="alert" className="text-sm text-status-out">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                     transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          가입하기
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  // useSearchParams 는 서스펜스 경계가 필요하다.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
