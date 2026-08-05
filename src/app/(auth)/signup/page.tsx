"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFormField } from "@/components/auth-form-field";

import { signUp, type AuthFormState } from "../actions";

const INITIAL: AuthFormState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">가입하기</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        가입 후 약관 동의 절차가 이어집니다. 미리 읽어보실 수 있습니다 —{" "}
        <Link href="/legal/terms" className="text-brand-text hover:underline">
          이용약관
        </Link>
        ,{" "}
        <Link href="/legal/privacy" className="text-brand-text hover:underline">
          개인정보 처리방침
        </Link>
        .
      </p>

      <form action={formAction} className="mt-8 space-y-4">
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
          autoComplete="new-password"
          required
          minLength={8}
          hint="8자 이상"
        />
        <AuthFormField
          label="비밀번호 확인"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />

        {state.error ? (
          <p role="alert" className="text-sm text-status-out">
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p
            role="status"
            className="rounded-lg border border-brand-200 bg-brand-soft px-3 py-2.5 text-sm text-brand-strong"
          >
            {state.notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white
                     transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "처리 중…" : "가입하기"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-brand-text hover:underline">
          로그인
        </Link>
      </p>
    </>
  );
}
