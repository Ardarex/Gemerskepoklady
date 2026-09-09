export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, email, date } = req.body;

    if (!name || !phone || !email || !date) {
      return res.status(400).json({
        error: "Vyplňte všetky údaje."
      });
    }

    const SUPABASE_URL = "SEM_VLOZ_API_URL";
    const SUPABASE_KEY = "SEM_VLOZ_PUBLISHABLE_KEY";

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          name,
          phone,
          email,
          date
        })
      }
    );

    if (!response.ok) {
      return res.status(500).json({
        error: "Rezerváciu sa nepodarilo uložiť."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rezervácia bola úspešne odoslaná."
    });

  } catch (error) {
    return res.status(500).json({
      error: "Nastala chyba servera."
    });
  }
}