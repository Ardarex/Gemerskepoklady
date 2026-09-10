const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { name, phone, email, date } = req.body;

    if (!name || !phone || !email || !date) {
      return res.status(400).json({
        error: "Vyplňte všetky údaje."
      });
    }

    // Kontrola počtu rezervácií
    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?date=eq.${encodeURIComponent(date)}&select=id`,
      {
        headers
      }
    );

    if (!checkResponse.ok) {
      return res.status(500).json({
        error: "Nepodarilo sa skontrolovať voľné miesta."
      });
    }

    const reservations = await checkResponse.json();

    if (reservations.length >= 10) {
      return res.status(409).json({
        error: "Tento termín je už plne obsadený."
      });
    }

    // Uloženie rezervácie
    const saveResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          name,
          phone,
          email,
          date
        })
      }
    );

    if (!saveResponse.ok) {
      return res.status(500).json({
        error: "Rezerváciu sa nepodarilo uložiť."
      });
    }

    // Odoslanie e-mailu
    const emailResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: "Keramický klub <onboarding@resend.dev>",
          to: ["renata.ksenicova@gos.sk"],
          subject: "Nová rezervácia – Keramický klub",
          html: `
            <h2>Nová rezervácia</h2>
            <p><strong>Meno:</strong> ${name}</p>
            <p><strong>Telefón:</strong> ${phone}</p>
            <p><strong>E-mail:</strong> ${email}</p>
            <p><strong>Termín:</strong> ${date}</p>
            <p><strong>Cena:</strong> 7 € / osoba</p>
          `
        })
      }
    );

    if (!emailResponse.ok) {
      console.error("Resend chyba:", await emailResponse.text());
    }

    return res.status(200).json({
      success: true,
      message: "Rezervácia bola úspešne odoslaná."
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Nastala chyba servera."
    });
  }
}