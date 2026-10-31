import { secureEqual } from "@/lib/auth";
import { pollLiveAlerts } from "@/lib/live-alerts";
import { apiError, AppError } from "@/lib/server";
export const maxDuration = 60; export const dynamic = "force-dynamic";
// Call every 1–5 minutes (Vercel Cron on a paid plan, or a free service such as cron-job.org) with the header
// "Authorization: Bearer <CRON_SECRET>". It delivers push alerts for new temp-mail emails and rental SMS while the app is closed.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET; if (!secret || secret.length < 16) throw new AppError("Scheduled alerts are not configured.", 503);
    if (!secureEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) throw new AppError("Unauthorized.", 401);
    return Response.json({ ok: true, ...(await pollLiveAlerts()) });
  } catch (e) { return apiError(e); }
}
