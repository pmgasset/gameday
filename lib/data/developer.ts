import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

export type DeveloperAccount = { user_id: string; display_name: string; email: string | null; created_at: string; last_sign_in_at: string | null; pool_count: number };
type Membership = { poolId: string; poolName: string; role: string; status: string; joinedAt: string; pickBlocked: boolean; activeMembers: number };
type RecentPick = { poolName: string; week: number; seasonType: string; team: string; spread: number; submittedAt: string; points: number | null };
type RecentActivity = { action: string; entityType: string; createdAt: string };
type SupportSnapshot = { sessionId: string; startedAt: string; expiresAt: string; account: { userId: string; displayName: string; email: string | null; createdAt: string; lastSignInAt: string | null }; memberships: Membership[]; recentPicks: RecentPick[]; recentActivity: RecentActivity[] };

export async function requireDeveloperAccess() {
  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/developer");
  const { data, error } = await db.rpc("is_developer");
  if (error || !data) redirect("/");
  return { db, user };
}

export async function developerDirectory(search = "") {
  const { db } = await requireDeveloperAccess();
  const { data, error } = await db.rpc("developer_account_directory", { p_search: search.trim() });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DeveloperAccount[];
}

export async function developerSupportSnapshot(sessionId: string) {
  const { db } = await requireDeveloperAccess();
  const { data, error } = await db.rpc("developer_support_snapshot", { p_session_id: sessionId });
  if (error || !data) return null;
  return data as unknown as SupportSnapshot;
}
