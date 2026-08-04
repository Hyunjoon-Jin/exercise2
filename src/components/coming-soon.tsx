interface Props {
  title: string;
  phase: string;
  description: string;
}

/**
 * Phase 0 는 뼈대만 세우는 단계다. 아직 구현되지 않은 화면은 빈 페이지 대신
 * 어느 단계에서 무엇이 들어오는지 알려 준다.
 */
export function ComingSoon({ title, phase, description }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{phase}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {description}
      </p>
    </div>
  );
}
