const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("supabase_not_configured");
  client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "conversation-copilot-server" } }
  });
  return client;
}

function resetSupabaseAdmin() {
  client = null;
}

module.exports = { getSupabaseAdmin, resetSupabaseAdmin };
