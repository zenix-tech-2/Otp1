import { getUser } from "@/lib/auth";
import { apiError } from "@/lib/server";
import { loadPopups } from "@/lib/popups";
import { popupLive } from "@/lib/popup-core";
export const dynamic = "force-dynamic";
// Pop-ups that are live right now. Only signed-in customers receive them (they appear after login).
export async function GET() {
  try {
    const user = await getUser(false);
    if (!user) return Response.json({ popups: [] });
    return Response.json({ popups: (await loadPopups()).filter(p => popupLive(p)).map(({ createdAt: _c, ...p }) => p) });
  } catch (e) { return apiError(e); }
}
