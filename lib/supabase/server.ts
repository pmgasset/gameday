import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Use only in Server Components, Route Handlers, and Server Actions. */
export async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are not configured");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values: Array<{ name: string; value: string; options: CookieOptions }>) => { try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Components cannot mutate cookies; middleware refreshes sessions. */ } }
    }
  });
}
