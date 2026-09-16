const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const TERMS = [
  "1. október",
  "15. október",
  "29. október",
  "12. november",
  "26. november",
  "10. december"
];

export default async function handler(req, res) {
  // =========================
  // GET – počet rezervácií
  // =========================
  if (req.method === "GET") {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?select=date`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const data = await response.json();

      const counts = {};

      TERMS.forEach((term) => {
        counts[term] = data.filter((item) => item.date === term).length;
      });

      return res.status(200).json({ counts });
    } catch (error) {
      return res.status(500).json({
        error: "Nepodarilo sa načítať rezervácie."
      });
    }
  }

  // =========================
  // POST – nová rezervácia
  // =========================
  if (req.method === "POST") {
    try {
      const {
        name,
        phone,
        email,
        date,
        start_time,
        end_time
      } = req.body;

      if (
        !name ||
        !phone ||
        !email ||
        !date ||
        !start_time ||
        !end_time
      ) {
        return res.status(400).json({
          error: "Vyplňte všetky údaje."
        });
      }

      if (!TERMS.includes(date)) {
        return res.status(400).json({
          error: "Neplatný termín."
        });
      }

      // Kontrola času
      const allowedTimes = [
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
        "19:00"
      ];

      if (
        !allowedTimes.includes(start_time) ||
        !allowedTimes.includes(end_time)
      ) {
        return res.status(400).json({
          error: "Neplatný čas."
        });
      }

      if (start_time >= end_time) {
        return res.status(400).json({
          error: "Koncový čas musí byť neskôr ako začiatok."
        });
      }

      // =========================
      // Kontrola kapacity – MAX 10 ĽUDÍ
      // =========================
      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?date=eq.${encodeURIComponent(
          date
        )}&select=id`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const existingReservations = await checkResponse.json();

      if (existingReservations.length >= 10) {
        return res.status(400).json({
          error: "Tento termín je už plne obsadený."
        });
      }

      // =========================
      // Uloženie rezervácie
      // =========================
      const insertResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            name,
            phone,
            email,
            date,
            start_time,
            end_time
          })
        }
      );

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();

        return res.status(500).json({
          error: "Rezerváciu sa nepodarilo uložiť.",
          details: errorText
        });
      }

      // =========================
      // E-mail do GOS
      // =========================
      if (RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Keramický klub <rezervacie@keramickyklub.site>",
            to: ["renata.ksenicova@gos.sk"],
            subject: "Nová rezervácia – Keramický klub",
            html: `
              <h2>Nová rezervácia</h2>

              <p><strong>Meno:</strong> ${name}</p>
              <p><strong>Telefón:</strong> ${phone}</p>
              <p><strong>E-mail:</strong> ${email}</p>
              <p><strong>Termín:</strong> ${date}</p>
              <p><strong>Čas:</strong> ${start_time} – ${end_time}</p>
              <p><strong>Cena:</strong> 7 €</p>
            `
          })
        });

        // =========================
        // Potvrdenie zákazníkovi
        // =========================
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Keramický klub <rezervacie@keramickyklub.site>",
            to: [email],
            subject: "Potvrdenie rezervácie – Keramický klub",
            html: `
              <h2>Potvrdenie rezervácie</h2>

              <p>Dobrý deň, ${name},</p>

              <p>vaša rezervácia bola úspešne prijatá.</p>

              <p><strong>Termín:</strong> ${date}</p>
              <p><strong>Čas:</strong> ${start_time} – ${end_time}</p>
              <p><strong>Cena:</strong> 7 €</p>

              <p>
                Prosíme, skontrolujte si, či sú uvedené údaje správne.
              </p>

              <p>Ďakujeme.</p>
              <p><strong>Keramický klub</strong></p>
            `
          })
        });
      }

      return res.status(200).json({
        success: true,
        message: "Rezervácia bola úspešne vytvorená."
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Nastala chyba pri vytváraní rezervácie."
      });
    }
  }

  return res.status(405).json({
    error: "Metóda nie je povolená."
  });
}