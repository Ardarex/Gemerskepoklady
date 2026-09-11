const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";

// NECHAJ TU SVOJ EXISTUJÚCI SUPABASE PUBLISHABLE KEY
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`
};

const TERMS = [
  "1. október",
  "15. október",
  "29. október",
  "12. november",
  "26. november",
  "10. december"
];


// ===============================
// GET – POČET REZERVÁCIÍ
// ===============================

if (false) {
  console.log("placeholder");
}

export default async function handler(req, res) {

  // -------------------------------
  // NAČÍTANIE POČTOV
  // -------------------------------

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

        const errorText = await response.text();

        console.error("Supabase GET chyba:", errorText);

        return res.status(500).json({
          error: "Nepodarilo sa načítať rezervácie."
        });
      }

      const reservations = await response.json();

      const counts = {};

      TERMS.forEach((term) => {
        counts[term] = 0;
      });

      reservations.forEach((reservation) => {

        if (counts[reservation.date] !== undefined) {
          counts[reservation.date]++;
        }

      });

      return res.status(200).json({
        counts
      });

    } catch (error) {

      console.error("GET chyba:", error);

      return res.status(500).json({
        error: "Nastala chyba pri načítaní termínov."
      });
    }
  }


  // -------------------------------
  // NOVÁ REZERVÁCIA
  // -------------------------------

  if (req.method === "POST") {

    try {

      const { name, phone, email, date } = req.body;

      if (!name || !phone || !email || !date) {

        return res.status(400).json({
          error: "Vyplňte všetky údaje."
        });
      }


      // -------------------------------
      // KONTROLA TERMÍNU
      // -------------------------------

      if (!TERMS.includes(date)) {

        return res.status(400).json({
          error: "Neplatný termín."
        });
      }


      // -------------------------------
      // KONTROLA VOĽNÝCH MIEST
      // -------------------------------

      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?date=eq.${encodeURIComponent(date)}&select=id`,
        {
          method: "GET",
          headers
        }
      );

      if (!checkResponse.ok) {

        const errorText = await checkResponse.text();

        console.error("Kontrola miest:", errorText);

        return res.status(500).json({
          error: "Nepodarilo sa skontrolovať voľné miesta."
        });
      }

      const existingReservations = await checkResponse.json();


      if (existingReservations.length >= 10) {

        return res.status(409).json({
          error: "Tento termín je už plne obsadený."
        });
      }


      // -------------------------------
      // ULOŽENIE REZERVÁCIE
      // -------------------------------

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

        const errorText = await saveResponse.text();

        console.error("Supabase INSERT chyba:", errorText);

        return res.status(500).json({
          error: "Rezerváciu sa nepodarilo uložiť."
        });
      }


      // -------------------------------
      // E-MAIL CEZ RESEND
      // -------------------------------

      const emailResponse = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`
          },

          body: JSON.stringify({

            // Tvoja overená doména
            from: "Keramický klub <rezervacie@keramickyklub.site>",

            // Kam má prísť oznámenie
            to: [
              "renata.ksenicova@gos.sk"
            ],

            subject: "Nová rezervácia – Keramický klub",

            html: `
              <h2>Nová rezervácia – Keramický klub</h2>

              <p>
                <strong>Meno:</strong>
                ${name}
              </p>

              <p>
                <strong>Telefón:</strong>
                ${phone}
              </p>

              <p>
                <strong>E-mail:</strong>
                ${email}
              </p>

              <p>
                <strong>Termín:</strong>
                ${date}
              </p>

              <p>
                <strong>Cena:</strong>
                7 € / osoba
              </p>

              <hr>

              <p>
                Rezervácia bola vytvorená cez web Keramického klubu.
              </p>
            `
          })
        }
      );


      // Ak Resend zlyhá, vypíšeme presnú chybu
      if (!emailResponse.ok) {

        const resendError = await emailResponse.text();

        console.error(
          "RESEND CHYBA:",
          resendError
        );

        return res.status(500).json({
          error:
            "Rezervácia bola uložená, ale e-mail sa nepodarilo odoslať."
        });
      }


      // -------------------------------
      // VŠETKO OK
      // -------------------------------

      return res.status(200).json({
        success: true,
        message: "Rezervácia bola úspešne odoslaná."
      });


    } catch (error) {

      console.error("SERVER CHYBA:", error);

      return res.status(500).json({
        error: "Nastala chyba servera."
      });
    }
  }


  return res.status(405).json({
    error: "Method not allowed"
  });
}