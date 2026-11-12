const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

async function adminContext(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user?.id) return null;
  const a = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: h });
  if (!a.ok) throw new Error("Nepodarilo sa overiĹĽ oprĂĄvnenie sprĂĄvcu.");
  const rows = await a.json();
  return rows.length ? { token, headers: { ...h, "Content-Type": "application/json", Prefer: "return=representation" } } : null;
}

function txt(v, max=180) { return typeof v === "string" ? v.trim().slice(0,max) : ""; }
function validSlot(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.event_date || "")) return "DĂĄtum termĂ­nu nie je sprĂĄvny.";
  if (!/^\d{2}:\d{2}$/.test(s.start_time || "")) return "Äas zaÄiatku nie je sprĂĄvny.";
  if (s.end_time && !/^\d{2}:\d{2}$/.test(s.end_time)) return "Äas ukonÄenia nie je sprĂĄvny.";
  if (!Number.isFinite(Number(s.price)) || Number(s.price)<0) return "Cena musĂ­ byĹĽ 0 alebo viac.";
  if (!Number.isInteger(Number(s.capacity)) || Number(s.capacity)<1 || Number(s.capacity)>500) return "Kapacita musĂ­ byĹĽ celĂŠ ÄĂ­slo od 1 do 500.";
  return null;
}
async function rest(path, headers, method="GET", body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  const data = await r.json().catch(()=>null);
  if (!r.ok) { const e = new Error(data?.message || data?.hint || "DatabĂĄzovĂĄ operĂĄcia zlyhala."); e.details=data; throw e; }
  return data;
}

export default async function handler(req,res) {
  if (!["GET","POST","PATCH"].includes(req.method)) { res.setHeader("Allow","GET, POST, PATCH"); return res.status(405).json({error:"NepovolenĂĄ metĂłda."}); }
  try {
    const admin = await adminContext(req);
    if (!admin) return res.status(403).json({error:"PrĂ­stup je povolenĂ˝ iba sprĂĄvcovi systĂŠmu."});
    const h=admin.headers;
    if (req.method === "GET") {
      const [sections,groups,slots,bookings] = await Promise.all([
        rest("event_sections?select=*&order=name.asc",h),
        rest("event_groups?select=*&order=created_at.desc",h),
        rest("events?select=*&order=event_date.asc,start_time.asc",h),
        rest("reservations?select=id,event_id,name,phone,email,date,created_at,type&order=created_at.desc",h)
      ]);
      return res.status(200).json({sections,groups,slots,bookings});
    }
    const b=req.body||{};
    if (req.method === "POST") {
      if (b.action === "create_section") {
        const name=txt(b.name,140); if(!name) return res.status(400).json({error:"Zadajte nĂĄzov sekcie."});
        const rows=await rest("event_sections",h,"POST",{name,active:true});
        return res.status(201).json({section:rows[0]});
      }
      if (b.action === "create_event") {
        const title=txt(b.title,140), instructor=txt(b.instructor,180), section_id=txt(b.section_id,80);
        if(!title || !section_id) return res.status(400).json({error:"Vyberte sekciu a zadajte nĂĄzov podujatia."});
        if(!Array.isArray(b.slots)||!b.slots.length) return res.status(400).json({error:"Pridajte aspoĹ jeden termĂ­n."});
        for(const s of b.slots){const err=validSlot(s);if(err)return res.status(400).json({error:err});}
        const sec=await rest(`event_sections?select=id,name&id=eq.${encodeURIComponent(section_id)}&limit=1`,h);
        if(!sec.length) return res.status(400).json({error:"VybranĂĄ sekcia neexistuje."});
        const groups=await rest("event_groups",h,"POST",{section_id,title,instructor,active:true});
        const group=groups[0];
        const rows=b.slots.map(s=>({event_group_id:group.id,section_title:sec[0].name,title,instructor,event_date:s.event_date,start_time:s.start_time,end_time:s.end_time||null,price:Number(s.price),capacity:Number(s.capacity),active:true}));
        const inserted=await rest("events",h,"POST",rows);
        return res.status(201).json({group,slots:inserted});
      }
      if (b.action === "add_slot") {
        const err=validSlot(b.slot||{}); if(err)return res.status(400).json({error:err});
        const groups=await rest(`event_groups?select=*&id=eq.${encodeURIComponent(b.group_id||"")}&limit=1`,h);
        if(!groups.length)return res.status(404).json({error:"Podujatie sa nenaĹĄlo."});
        const sec=await rest(`event_sections?select=name&id=eq.${encodeURIComponent(groups[0].section_id)}&limit=1`,h);
        const s=b.slot;
        const rows=await rest("events",h,"POST",{event_group_id:groups[0].id,section_title:sec[0]?.name||"",title:groups[0].title,instructor:groups[0].instructor,event_date:s.event_date,start_time:s.start_time,end_time:s.end_time||null,price:Number(s.price),capacity:Number(s.capacity),active:true});
        return res.status(201).json({slot:rows[0]});
      }
      return res.status(400).json({error:"NeznĂĄma operĂĄcia."});
    }
    if (b.action === "toggle_section") {
      if(!b.id || typeof b.active!=="boolean")return res.status(400).json({error:"ChĂ˝ba sekcia alebo stav."});
      const rows=await rest(`event_sections?id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{active:b.active});
      return res.status(200).json({section:rows[0]||null});
    }
    if (b.action === "toggle_group") {
      if(!b.id || typeof b.active!=="boolean")return res.status(400).json({error:"ChĂ˝ba podujatie alebo stav."});
      const rows=await rest(`event_groups?id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{active:b.active,updated_at:new Date().toISOString()});
      // DeaktivĂĄcia skupiny zĂĄroveĹ skryje vĹĄetky jej termĂ­ny; rezervĂĄcie ostĂĄvajĂş zachovanĂŠ.
      await rest(`events?event_group_id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{active:b.active});
      return res.status(200).json({group:rows[0]||null});
    }
    if (b.action === "toggle_slot") {
      if(!b.id || typeof b.active!=="boolean")return res.status(400).json({error:"ChĂ˝ba termĂ­n alebo stav."});
      const rows=await rest(`events?id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{active:b.active});
      return res.status(200).json({slot:rows[0]||null});
    }
    if (b.action === "update_group") {
      if(!b.id || !txt(b.title,140) || !b.section_id)return res.status(400).json({error:"VyplĹte nĂĄzov a sekciu."});
      const sec=await rest(`event_sections?select=name&id=eq.${encodeURIComponent(b.section_id)}&limit=1`,h);
      if(!sec.length)return res.status(400).json({error:"Sekcia sa nenaĹĄla."});
      const rows=await rest(`event_groups?id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{title:txt(b.title,140),instructor:txt(b.instructor,180),section_id:b.section_id,updated_at:new Date().toISOString()});
      // Aktualizuje aj nĂĄzvy zobrazovanĂŠ v starĹĄĂ­ch zĂĄznamoch termĂ­nov.
      await rest(`events?event_group_id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{title:txt(b.title,140),instructor:txt(b.instructor,180),section_title:sec[0].name});
      return res.status(200).json({group:rows[0]||null});
    }
    if (b.action === "update_slot") {
      if(!b.id)return res.status(400).json({error:"ChĂ˝ba identifikĂĄtor termĂ­nu."});
      const err=validSlot(b.slot||{});if(err)return res.status(400).json({error:err});
      const s=b.slot;const rows=await rest(`events?id=eq.${encodeURIComponent(b.id)}`,h,"PATCH",{event_date:s.event_date,start_time:s.start_time,end_time:s.end_time||null,price:Number(s.price),capacity:Number(s.capacity)});
      return res.status(200).json({slot:rows[0]||null});
    }
    return res.status(400).json({error:"NeznĂĄma operĂĄcia."});
  } catch(e) {
    console.error("admin-events error",e);
    return res.status(500).json({error:e.message||"InternĂĄ chyba servera.",details:e.details||undefined});
  }
}
