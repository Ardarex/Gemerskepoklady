const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`
};

export default async function handler(req, res) {

  // ZÍSKANIE POČTU REZERVÁCIÍ
  if (req.method === "GET") {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?select=date`,
        {
          method: "GET",
          headers
        }
      );

      if (!response.ok) {
        return res.status(500).json({
          error: "Nepodarilo sa načítať rezervácie."
        });
      }

      const reservations = await response.json();

      const counts = {
        "1. október": 0,
        "15. október": 0,
        "29. október": 0,
        "12. november": 0,
        "26. november": 0,
        "10. december": 0
      };

      reservations.forEach((reservation) => {
        if (counts[reservation.date] !== undefined) {
          counts[reservation.date]++;
        }
      });

      return res.status(200).json({ counts });

    } catch (error) {
      return res.status(500).json({
        error: "Nastala chyba servera."
      });
    }
  }


  // VYTVORENIE REZERVÁCIE
  if (req.method === "POST") {
    try {
      const { name, phone, email, date } = req.body;

      if (!name || !phone || !email || !date) {
        return res.status(400).json({
          error: "Vyplňte všetky údaje."
        });
      }

      // ZISTÍME, KOĽKO ĽUDÍ JE UŽ PRIHLÁSENÝCH
      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?date=eq.${encodeURIComponent(date)}&select=id`,
        {
          method: "GET",
          headers
        }
      );

      if (!checkResponse.ok) {
        return res.status(500).json({
          error: "Nepodarilo sa skontrolovať voľné miesta."
        });
      }

      const existingReservations = await checkResponse.json();

      // MAXIMÁLNE 10 ĽUDÍ
      if (existingReservations.length >= 10) {
        return res.status(409).json({
          error: "Tento termín je už plne obsadený."
        });
      }

      // ULOŽENIE REZERVÁCIE
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
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


  return res.status(405).json({
    error: "Method not allowed"
  });
}