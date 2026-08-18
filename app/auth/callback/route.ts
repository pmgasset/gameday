import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url); const code=url.searchParams.get("code"); const requestedNext=url.searchParams.get("next") ?? "/"; const next=requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const response=NextResponse.redirect(new URL(next,url.origin)); const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !supabaseUrl || !key) return NextResponse.redirect(new URL("/login?error=unavailable",url.origin));
  const supabase=createServerClient(supabaseUrl,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(values: Array<{name:string;value:string;options:CookieOptions}>)=>values.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
  const {error}=await supabase.auth.exchangeCodeForSession(code); if(error) return NextResponse.redirect(new URL("/login?error=invalid-link",url.origin)); return response;
}
