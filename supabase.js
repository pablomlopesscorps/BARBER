/* ======================================================================
   CONEXÃO COM O SUPABASE
   Configure aqui a URL e a chave anon do seu projeto.
====================================================================== */
const SUPABASE_URL = "https://cmujcmfgsmfnqupoceyg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdWpjbWZnc21mbnF1cG9jZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNjEzNTEsImV4cCI6MjA5OTczNzM1MX0.p6Qb2XLq0gwWXembZZHWOdWzAW8lbp8FVShFQkTwVk4";

/**
 * Faz uma requisição crua para a REST API do Supabase (PostgREST).
 * @param {string} table - nome da tabela
 * @param {object} opts - { method, query, body, prefer }
 */
async function sbRequest(table, opts = {}) {
  const { method = "GET", query = "", body = null, prefer = "return=representation" } = opts;
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers["Prefer"] = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) { /* noop */ }
    throw new Error(`Erro Supabase [${method} ${table}] ${res.status}: ${detail || res.statusText}`);
  }

  if (method === "DELETE" || prefer.includes("minimal")) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Helpers de alto nível para cada operação CRUD via REST (PostgREST). */
const db = {
  /** query deve começar com "?", ex: "?select=*&SYSTEM=eq.abc" */
  select: (table, query = "?select=*") => sbRequest(table, { method: "GET", query }),
  insert: (table, body) => sbRequest(table, { method: "POST", body }),
  insertMany: (table, bodyArray) => sbRequest(table, { method: "POST", body: bodyArray }),
  update: (table, query, body) => sbRequest(table, { method: "PATCH", query, body }),
  remove: (table, query) => sbRequest(table, { method: "DELETE", query, prefer: "return=minimal" }),
};

/** Hash SHA-256 simples para não guardar senha em texto puro. */
async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Escapa valor pra usar em filtro PostgREST (eq.valor) evitando injeção via vírgula/etc. */
function pgEsc(v) {
  return encodeURIComponent(String(v));
}
