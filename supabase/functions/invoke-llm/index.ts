// invoke-llm: vision + text LLM calls for the app (receipt extraction, etc.).
// Mirrors the Base44 integrations.Core.InvokeLLM contract:
//   { prompt, file_urls?: string[], response_json_schema?: object } -> parsed JSON object.
// Uses one shared Anthropic key (billed centrally, all tenants). JWT-verified so
// only authenticated users can spend the budget.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("RECEIPT_MODEL") ?? "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "AI extraction is not configured yet (missing API key)." }, 503);

    const { prompt, file_urls, response_json_schema } = await req.json().catch(() => ({}));

    const content: any[] = [];
    for (const url of (Array.isArray(file_urls) ? file_urls : [])) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const ct = (resp.headers.get("content-type") || "").split(";")[0];
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const data = toBase64(bytes);
        const isPdf = ct === "application/pdf" || url.toLowerCase().split("?")[0].endsWith(".pdf");
        if (isPdf) {
          // Claude reads PDFs natively as a document block (base64, no beta header needed).
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        } else {
          const media_type = ct.startsWith("image/") ? ct : "image/jpeg";
          content.push({ type: "image", source: { type: "base64", media_type, data } });
        }
      } catch (_e) { /* skip unreadable file */ }
    }

    let text = prompt || "Extract the requested data.";
    if (response_json_schema) {
      // Ask for a FLAT object keyed by the schema's own top-level property names. Dumping the raw
      // JSON Schema here made the model sometimes echo the schema envelope ({type, properties})
      // with the values nested inside, which callers reading top-level keys then can't find.
      const keys = response_json_schema?.properties && typeof response_json_schema.properties === "object"
        ? Object.keys(response_json_schema.properties)
        : null;
      if (keys && keys.length) {
        text += `\n\nReturn ONLY a flat JSON object whose top-level keys are exactly: ${keys.join(", ")}. Do NOT wrap it in a JSON Schema; do NOT include "type" or "properties" keys. No markdown, no code fences, no explanation.`;
      } else {
        text += `\n\nReturn ONLY a JSON object matching this schema. No markdown, no code fences, no explanation:\n${JSON.stringify(response_json_schema)}`;
      }
    }
    content.push({ type: "text", text });

    const aResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content }] }),
    });

    if (!aResp.ok) {
      const t = await aResp.text();
      return json({ error: `LLM request failed (${aResp.status}): ${t.slice(0, 300)}` }, 502);
    }

    const data = await aResp.json();
    // Find the text block (Claude may return a thinking block first, which has no .text).
    const textBlock = Array.isArray(data?.content) ? data.content.find((b: any) => b.type === "text") : null;
    const rawText = (textBlock?.text ?? "").trim();
    const cleaned = rawText.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      let parsed = JSON.parse(cleaned);
      // Defense in depth: if the model still echoed the schema envelope ({type:"object",
      // properties:{...actual values...}}) and the requested keys are nested under .properties,
      // unwrap so callers get the flat object they asked for.
      const wantKeys = response_json_schema?.properties && typeof response_json_schema.properties === "object"
        ? Object.keys(response_json_schema.properties) : [];
      if (parsed && typeof parsed === "object" && parsed.type === "object" &&
          parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties) &&
          wantKeys.some((k) => k in parsed.properties)) {
        parsed = parsed.properties;
      }
      return json(parsed);
    } catch (_e) {
      // Return raw text so callers that expected free-form still get something.
      return json({ _raw: rawText });
    }
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
