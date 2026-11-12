const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

async function getAdmin(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!authRes.ok) return null;
  const user = await authRes.json();
  if (!user?.id) return null;

  const adminRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
  );
  if (!adminRes.ok) throw new Error("Nepodarilo sa overiť oprávnenie správcu.");
  const rows = await adminRes.json();
  return rows.length ? { user, token } : null;
}

function cleanText(value, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateEvent(body, partial = false) {
  const fields = {};
  const textFields = ["section_title", "title", "instructor"];
  for (const key of textFields) {
    if (body[key] !== undefined) fields[key] = cleanText(body[key], key === "instructor" ? 180 : 140);
  }
  for (const key of ["event_date", "start_time", "end_time"]) {
    if (body[key] !== undefined) fields[key] = body[key] || null;
  }
  for (const key of ["price", "capacity"]) {
    if (body[key] !== undefined) fields[key] = Number(body[key]);
  }
  if (body.active !== undefined) fields.active = Boolean(body.active);

  if (!partial) {
    if (!fields.section_title || !fields.title || !fields.event_date || !fields.start_time) {
      return { error: "Vyplňte názov sekcie, názov podujatia, dátum a čas začiatku." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.event_date)) return { error: "Dátum musí byť vo formáte RRRR-MM-DD." };
    if (!/^\d{2}:\d{2}$/.test(fields.start_time)) return { error: "Čas musí byť vo formáte HH:MM." };
    if (fields.end_time && !/^\d{2}:\d{2}$/.test(fields.end_time)) return { error: "Čas ukončenia musí byť vo formáte HH:MM." };
    if (!Number.isFinite(fields.price) || fields.price < 0) return { error: "Cena musí byť 0 alebo vyššia." };
    if (!Number.isInteger(fields.capacity) || fields.capacity < 1 || fields.capacity > 500) return { error: "Kapacita musí byť celé číslo od 1 do 500." };
  }
  return { fields };
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Nepovolená metóda." });
  }

  try {
    const admin = await getAdmin(req);
    if (!admin) return res.status(403).json({ error: "Prístup je povolený iba správcovi systému." });
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${admin.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    if (req.method === "GET") {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/events?select=*&order=event_date.asc,start_time.asc`,
        { headers }
      );
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: "Podujatia sa nepodarilo načítať.", details: data });
      const bookingsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?select=id,event_id,name,phone,email,date,created_at,type&order=created_at.desc`,
        { headers }
      );
      const bookings = await bookingsResponse.json();
      if (!bookingsResponse.ok) return res.status(500).json({ error: "Rezervácie sa nepodarilo načítať.", details: bookings });
      return res.status(200).json({ events: data, bookings });
    }

    if (req.method === "POST") {
      const checked = validateEvent(req.body || {});
      if (checked.error) return res.status(400).json({ error: checked.error });
      const response = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST", headers, body: JSON.stringify(checked.fields)
      });
      const data = await response.json();
      if (!response.ok) return res.status(400).json({ error: "Podujatie sa nepodarilo uložiť.", details: data });
      return res.status(201).json({ event: data[0] });
    }

    const body = req.body || {};
    if (!body.id) return res.status(400).json({ error: "Chýba identifikátor podujatia." });
    const checked = validateEvent(body, true);
    if (checked.error) return res.status(400).json({ error: checked.error });
    if (!Object.keys(checked.fields).length) return res.status(400).json({ error: "Nie sú zadané žiadne zmeny." });
    checked.fields.updated_at = new Date().toISOString();
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(body.id)}`,
      { method: "PATCH", headers, body: JSON.stringify(checked.fields) }
    );
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: "Zmeny sa nepodarilo uložiť.", details: data });
    if (!data.length) return res.status(404).json({ error: "Podujatie sa nenašlo." });
    return res.status(200).json({ event: data[0] });
  } catch (error) {
    console.error("admin-events error:", error);
    return res.status(500).json({ error: error.message || "Interná chyba servera." });
  }
}
