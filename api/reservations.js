const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";

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

export default async function handler(req, res) {

  // =====================================
  // GET – AKTUÁLNA OBSADENOSŤ TERMÍNOV
  // =====================================

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


  // =====================================
  // POST – NOVÁ REZERVÁCIA
  // =====================================

  if (req.method === "POST") {

    try {

      const { name, phone, email, date } = req.body;


      // Kontrola údajov

      if (!name || !phone || !email || !date) {

        return res.status(400).json({
          error: "Vyplňte všetky údaje."
        });
      }


      // Kontrola platného termínu

      if (!TERMS.includes(date)) {

        return res.status(400).json({
          error: "Neplatný termín."
        });
      }


      // =====================================
      // KONTROLA VOĽNÝCH MIEST
      // =====================================

      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?date=eq.${encodeURIComponent(date)}&select=id`,
        {
          method: "GET",
          headers
        }
      );

      if (!checkResponse.ok) {

        const errorText = await checkResponse.text();

        console.error(
          "Kontrola miest chyba:",
          errorText
        );

        return res.status(500).json({
          error: "Nepodarilo sa skontrolovať voľné miesta."
        });
      }

      const existingReservations =
        await checkResponse.json();


      // Maximálne 10 ľudí

      if (existingReservations.length >= 10) {

        return res.status(409).json({
          error: "Tento termín je už plne obsadený."
        });
      }


      // =====================================
      // ULOŽENIE REZERVÁCIE
      // =====================================

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

        console.error(
          "Supabase INSERT chyba:",
          errorText
        );

        return res.status(500).json({
          error: "Rezerváciu sa nepodarilo uložiť."
        });
      }


      // =====================================
      // E-MAIL GOS
      // =====================================

      const emailGosResponse = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`
          },

          body: JSON.stringify({

            from:
              "Keramický klub <rezervacie@keramickyklub.site>",

            to: [
              "renata.ksenicova@gos.sk"
            ],

            subject:
              "Nová rezervácia – Keramický klub",

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
                Nová rezervácia bola vytvorená
                cez web Keramického klubu.
              </p>

            `
          })
        }
      );


      if (!emailGosResponse.ok) {

        console.error(
          "GOS e-mail chyba:",
          await emailGosResponse.text()
        );
      }


      // =====================================
      // POTVRDZOVACÍ E-MAIL ÚČASTNÍKOVI
      // =====================================

      const emailUserResponse = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`
          },

          body: JSON.stringify({

            from:
              "Keramický klub <rezervacie@keramickyklub.site>",

            to: [
              email
            ],

            subject:
              "Potvrdenie rezervácie – Keramický klub",

            html: `

              <h2>
                Potvrdenie rezervácie
              </h2>

              <p>
                Dobrý deň,
              </p>

              <p>
                ďakujeme za Vašu rezerváciu
                na <strong>Keramický klub</strong>.
              </p>

              <h3>
                Vaše údaje:
              </h3>

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
                7 € na hodinu / osoba
              </p>

              <hr>

              <p>
                <strong>
                  Prosíme, skontrolujte si,
                  či sú uvedené údaje správne.
                </strong>
              </p>

              <p>
                Ak ste našli chybu v údajoch,
                kontaktujte nás na:
              </p>

              <p>
                <a href="mailto:renata.ksenicova@gos.sk">
                  renata.ksenicova@gos.sk
                </a>
              </p>

              <p>
                Tešíme sa na Vás! 🏺
              </p>

              <p>
                Gemerské osvetové stredisko<br>
                Keramický klub
              </p>

            `
          })
        }
      );


      if (!emailUserResponse.ok) {

        console.error(
          "Potvrdzovací e-mail chyba:",
          await emailUserResponse.text()
        );
      }


      // =====================================
      // HOTOVO
      // =====================================

      return res.status(200).json({

        success: true,

        message:
          "Rezervácia bola úspešne odoslaná."

      });


    } catch (error) {

      console.error(
        "SERVER CHYBA:",
        error
      );

      return res.status(500).json({

        error:
          "Nastala chyba servera."

      });
    }
  }


  return res.status(405).json({

    error:
      "Method not allowed"

  });
}