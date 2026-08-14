import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, preflight } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anonKey || !serviceKey) return json({ error: "server_not_configured" }, 500);

  let body: { confirm?: boolean } = {};
  try { body = await request.json(); } catch {}
  if (body.confirm !== true) return json({ error: "confirmation_required" }, 400);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user?.id) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Remove the private avatar object before the auth user is deleted.
  const { data: profile } = await admin
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  const avatarPath = String(profile?.avatar_path || "");
  if (avatarPath) {
    const { error: avatarError } = await admin.storage.from("myfi-avatars").remove([avatarPath]);
    if (avatarError) return json({ error: "avatar_delete_failed" }, 500);
  }

  // Database rows tied to auth.users use ON DELETE CASCADE in MYFI's schema.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: "account_delete_failed" }, 500);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
});
