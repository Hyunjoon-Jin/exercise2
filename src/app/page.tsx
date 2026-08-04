import Link from "next/link";

const FEATURES = [
  {
    title: "흩어진 기록을 한 시간축에",
    body: "체중·혈압·혈당 같은 자가측정과 건강검진 결과가 같은 그래프에 올라갑니다. 검진에서 본 수치가 그 뒤로 어떻게 변했는지 바로 확인할 수 있습니다.",
  },
  {
    title: "검진 결과지는 올리기만 하면",
    body: "PDF나 사진을 올리면 항목과 수치를 자동으로 읽어냅니다. 저장 전에 원본과 나란히 두고 직접 확인하실 수 있습니다.",
  },
  {
    title: "매일의 기록은 몇 초 안에",
    body: "식단·운동·복약·수면을 빠르게 남기고, 주간 리포트로 흐름을 봅니다.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">건강기록</span>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 font-medium text-muted transition-colors hover:text-foreground"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
            >
              시작하기
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          건강 데이터를
          <br />
          한 곳에 모아 봅니다
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          식단, 운동, 복약, 수면, 신체 수치, 그리고 건강검진 결과까지. 여러 앱에
          흩어져 있던 기록을 하나의 시간축에서 함께 봅니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-xl bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-border px-6 py-3 font-medium transition-colors hover:bg-surface"
          >
            이미 계정이 있어요
          </Link>
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <h2 className="text-base font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-muted">
          <p className="leading-relaxed">
            본 서비스는 의료기기가 아니며 의학적 진단·치료·처방을 제공하지 않습니다.
            표시되는 수치와 참고범위는 참고용이며, 건강상 판단이 필요한 경우 반드시
            의료진과 상담하시기 바랍니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
