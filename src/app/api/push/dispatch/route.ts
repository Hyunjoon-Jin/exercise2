import { NextResponse, type NextRequest } from "next/server";

import { getWebPush, isPushConfigured } from "@/lib/push/vapid";
import { createAdminClient } from "@/lib/supabase/admin";

/** 이 라우트는 스케줄러만 호출한다. 매 요청 DB 를 훑으므로 캐시하면 안 된다. */
export const dynamic = "force-dynamic";

interface DueReminder {
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
}

/**
 * 복약 알림 발송.
 *
 * pg_cron 이 몇 분마다 호출한다 (0006_medication_reminders.sql 하단 참고).
 * 응답으로 발송 건수를 돌려주므로 스케줄러 로그만 봐도 동작 여부를 알 수 있다.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // 시크릿이 없으면 누구나 호출할 수 있게 되므로 아예 막는다.
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  const webpush = getWebPush()!;
  const supabase = createAdminClient();

  const windowMinutes = Number(process.env.PUSH_WINDOW_MINUTES ?? 10);

  const { data, error } = await supabase.rpc("due_medication_reminders", {
    window_minutes: windowMinutes,
  });

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const reminders = (data ?? []) as DueReminder[];
  let sent = 0;
  let expired = 0;

  // 순차 발송. 한 사용자가 가진 구독 수도, 동시에 알릴 사용자 수도
  // 이 단계에서는 크지 않으므로 병렬화보다 실패 처리의 단순함을 택한다.
  for (const reminder of reminders) {
    const dosage = reminder.dosage_amount
      ? ` ${reminder.dosage_amount}${reminder.dosage_unit ?? ""}`
      : "";

    const payload = JSON.stringify({
      title: "복약 시간입니다",
      body: `${reminder.medication_name}${dosage}`,
      tag: `medication-${reminder.schedule_id}`,
      url: "/medications",
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: reminder.endpoint,
          keys: { p256dh: reminder.p256dh, auth: reminder.auth_key },
        },
        payload,
      );
      sent += 1;
      await supabase.rpc("mark_push_success", {
        subscription_endpoint: reminder.endpoint,
      });
    } catch (sendError) {
      // 404/410 은 구독이 만료된 것. 일시적 오류와 구분하기 위해
      // 즉시 지우지 않고 실패 횟수만 올린다.
      const statusCode =
        typeof sendError === "object" && sendError !== null && "statusCode" in sendError
          ? Number((sendError as { statusCode: unknown }).statusCode)
          : 0;

      if (statusCode === 404 || statusCode === 410) expired += 1;

      await supabase.rpc("mark_push_failure", {
        subscription_endpoint: reminder.endpoint,
      });
    }
  }

  return NextResponse.json({ due: reminders.length, sent, expired });
}
