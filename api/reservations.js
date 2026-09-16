const SUPABASE_URL = "https://udrkkbpsfsbuvojzqfjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const CLUB_CAPACITY = 10;
const COURSE_CAPACITY = 7;

const CLUB_TERMS = [
  "1. október",
  "15. október",
  "29. október",
  "12. november",
  "26. november",
  "10. december"
];


// ==========================================
// NAČÍTANIE REZERVÁCIÍ
// ==========================================

async function getReservations() {

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/reservations?select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("Nepodarilo sa načítať rezervácie.");
  }

  return await response.json();
}


// ==========================================
// ODOSLANIE E-MAILU
// ==========================================

async function sendEmail(to, subject, html) {

  if (!RESEND_API_KEY) {
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",

    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      from: "Keramický klub <rezervacie@keramickyklub.site>",
      to: [to],
      subject,
      html
    })
  });
}


// ==========================================
// HLAVNÁ FUNKCIA
// ==========================================

export default async function handler(req, res) {


  // ========================================
  // GET – VOĽNÉ MIESTA
  // ========================================

  if (req.method === "GET") {

    try {

      const reservations = await getReservations();


      // ======================================
      // KLUB – 10 ĽUDÍ NA KAŽDÚ HODINU
      // ======================================

      const club = {};


      CLUB_TERMS.forEach(term => {

        club[term] = {};

        [
          "14:00",
          "15:00",
          "16:00",
          "17:00",
          "18:00"
        ].forEach(hour => {

          club[term][hour] = 0;

        });

      });


      reservations
        .filter(item => item.type === "club")
        .forEach(item => {

          if (!club[item.date]) {
            return;
          }

          if (!item.start_time || !item.end_time) {
            return;
          }


          const startHour =
            parseInt(item.start_time.substring(0, 2));

          const endHour =
            parseInt(item.end_time.substring(0, 2));


          for (
            let hour = startHour;
            hour < endHour;
            hour++
          ) {

            const hourText =
              String(hour).padStart(2, "0") + ":00";


            if (
              club[item.date][hourText] !== undefined
            ) {

              club[item.date][hourText]++;

            }

          }

        });


      // ======================================
      // KURZ – 7 ĽUDÍ CELKOVO
      // ======================================

      const courseReserved =
        reservations.filter(
          item => item.type === "course"
        ).length;


      const courseAvailable =
        Math.max(
          0,
          COURSE_CAPACITY - courseReserved
        );


      return res.status(200).json({

        club,

        course: {

          reserved: courseReserved,

          available: courseAvailable,

          capacity: COURSE_CAPACITY

        }

      });


    } catch (error) {

      console.error(error);

      return res.status(500).json({

        error:
          "Nepodarilo sa načítať dostupnosť."

      });

    }

  }


  // ========================================
  // POST – NOVÁ REGISTRÁCIA
  // ========================================

  if (req.method === "POST") {

    try {

      const {
        type,
        name,
        phone,
        email,
        date,
        start_time,
        end_time
      } = req.body;


      // ======================================
      // KERAMICKÝ KURZ
      // ======================================

      if (type === "course") {

        if (!name || !phone || !email) {

          return res.status(400).json({

            error:
              "Vyplňte všetky údaje."

          });

        }


        const reservations =
          await getReservations();


        const courseReserved =
          reservations.filter(
            item => item.type === "course"
          ).length;


        // MAXIMÁLNE 7 ĽUDÍ

        if (
          courseReserved >= COURSE_CAPACITY
        ) {

          return res.status(400).json({

            error:
              "Keramický kurz je už plne obsadený."

          });

        }


        const coursePlace =
          courseReserved + 1;


        // ULOŽENIE KURZU

        const insertResponse =
          await fetch(
            `${SUPABASE_URL}/rest/v1/reservations`,
            {
              method: "POST",

              headers: {

                apikey: SUPABASE_KEY,

                Authorization:
                  `Bearer ${SUPABASE_KEY}`,

                "Content-Type":
                  "application/json",

                Prefer:
                  "return=minimal"

              },

              body: JSON.stringify({

                type: "course",

                name,
                phone,
                email,

                date:
                  "13. október – 1. december",

                start_time: null,
                end_time: null,

                course_place:
                  coursePlace

              })

            }
          );


        if (!insertResponse.ok) {

          console.error(
            await insertResponse.text()
          );

          return res.status(500).json({

            error:
              "Prihlásenie na kurz sa nepodarilo uložiť."

          });

        }


        // E-MAIL ORGANIZÁTOROVI

        await sendEmail(

          "renata.ksenicova@gos.sk",

          "Nová prihláška – Keramický kurz",

          `
            <h2>Nová prihláška na keramický kurz</h2>

            <p>
              <strong>Meno:</strong> ${name}
            </p>

            <p>
              <strong>Telefón:</strong> ${phone}
            </p>

            <p>
              <strong>E-mail:</strong> ${email}
            </p>

            <p>
              <strong>Termín:</strong>
              13. október – 1. december
            </p>

            <p>
              <strong>Cena:</strong> 150 €
            </p>

            <p>
              <strong>Miesto:</strong>
              ${coursePlace}/${COURSE_CAPACITY}
            </p>
          `

        );


        // POTVRDENIE ÚČASTNÍKOVI

        await sendEmail(

          email,

          "Potvrdenie prihlásenia – Keramický kurz",

          `
            <h2>Potvrdenie prihlásenia</h2>

            <p>
              Dobrý deň, ${name},
            </p>

            <p>
              vaše prihlásenie na keramický kurz
              bolo úspešne prijaté.
            </p>

            <p>
              <strong>Termín:</strong>
              13. október – 1. december
            </p>

            <p>
              <strong>Cena:</strong>
              150 €
            </p>

            <p>
              <strong>Vaše miesto:</strong>
              ${coursePlace}/${COURSE_CAPACITY}
            </p>

            <p>
              Ak potvrdzovací e-mail nevidíte,
              skontrolujte aj priečinok Spam
              alebo Nevyžiadaná pošta.
            </p>

            <p>
              Ďakujeme.
            </p>

            <p>
              <strong>Keramický klub</strong>
            </p>
          `

        );


        return res.status(200).json({

          success: true,

          message:
            "Prihlásenie na kurz bolo úspešné."

        });

      }


      // ======================================
      // KERAMICKÝ KLUB
      // ======================================

      if (type === "club") {

        if (
          !name ||
          !phone ||
          !email ||
          !date ||
          !start_time ||
          !end_time
        ) {

          return res.status(400).json({

            error:
              "Vyplňte všetky údaje a vyberte čas."

          });

        }


        if (!CLUB_TERMS.includes(date)) {

          return res.status(400).json({

            error:
              "Neplatný termín."

          });

        }


        const allowedStartTimes = [
          "14:00",
          "15:00",
          "16:00",
          "17:00",
          "18:00"
        ];


        const allowedEndTimes = [
          "15:00",
          "16:00",
          "17:00",
          "18:00",
          "19:00"
        ];


        if (
          !allowedStartTimes.includes(start_time) ||
          !allowedEndTimes.includes(end_time)
        ) {

          return res.status(400).json({

            error:
              "Neplatný čas."

          });

        }


        if (start_time >= end_time) {

          return res.status(400).json({

            error:
              "Koncový čas musí byť neskôr ako začiatok."

          });

        }


        const reservations =
          await getReservations();


        const clubReservations =
          reservations.filter(
            item =>
              item.type === "club" &&
              item.date === date
          );


        const startHour =
          parseInt(
            start_time.substring(0, 2)
          );


        const endHour =
          parseInt(
            end_time.substring(0, 2)
          );


        // ======================================
        // KONTROLA KAŽDEJ VYBRANEJ HODINY
        // MAX 10 ĽUDÍ
        // ======================================

        for (
          let hour = startHour;
          hour < endHour;
          hour++
        ) {

          const hourStart =
            String(hour).padStart(2, "0") + ":00";

          const hourEnd =
            String(hour + 1).padStart(2, "0") + ":00";


          let peopleAtThisHour = 0;


          clubReservations.forEach(item => {

            if (
              !item.start_time ||
              !item.end_time
            ) {
              return;
            }


            const existingStart =
              parseInt(
                item.start_time.substring(0, 2)
              );


            const existingEnd =
              parseInt(
                item.end_time.substring(0, 2)
              );


            if (
              existingStart <= hour &&
              existingEnd > hour
            ) {

              peopleAtThisHour++;

            }

          });


          if (
            peopleAtThisHour >= CLUB_CAPACITY
          ) {

            return res.status(400).json({

              error:
                `Čas ${hourStart} – ${hourEnd} je už plne obsadený.`

            });

          }

        }


        // ======================================
        // ULOŽENIE KLUBU
        // ======================================

        const insertResponse =
          await fetch(
            `${SUPABASE_URL}/rest/v1/reservations`,
            {
              method: "POST",

              headers: {

                apikey: SUPABASE_KEY,

                Authorization:
                  `Bearer ${SUPABASE_KEY}`,

                "Content-Type":
                  "application/json",

                Prefer:
                  "return=minimal"

              },

              body: JSON.stringify({

                type: "club",

                name,
                phone,
                email,

                date,

                start_time,
                end_time,

                course_place: null

              })

            }
          );


        if (!insertResponse.ok) {

          console.error(
            await insertResponse.text()
          );

          return res.status(500).json({

            error:
              "Rezerváciu sa nepodarilo uložiť."

          });

        }


        // E-MAIL ORGANIZÁTOROVI

        await sendEmail(

          "renata.ksenicova@gos.sk",

          "Nová rezervácia – Keramický klub",

          `
            <h2>Nová rezervácia – Keramický klub</h2>

            <p>
              <strong>Meno:</strong> ${name}
            </p>

            <p>
              <strong>Telefón:</strong> ${phone}
            </p>

            <p>
              <strong>E-mail:</strong> ${email}
            </p>

            <p>
              <strong>Termín:</strong> ${date}
            </p>

            <p>
              <strong>Čas:</strong>
              ${start_time} – ${end_time}
            </p>

            <p>
              <strong>Cena:</strong> 7 €
            </p>
          `

        );


        // POTVRDENIE ZÁKAZNÍKOVI

        await sendEmail(

          email,

          "Potvrdenie rezervácie – Keramický klub",

          `
            <h2>Potvrdenie rezervácie</h2>

            <p>
              Dobrý deň, ${name},
            </p>

            <p>
              vaša rezervácia bola úspešne prijatá.
            </p>

            <p>
              <strong>Termín:</strong> ${date}
            </p>

            <p>
              <strong>Čas:</strong>
              ${start_time} – ${end_time}
            </p>

            <p>
              <strong>Cena:</strong> 7 €
            </p>

            <p>
              Ak potvrdzovací e-mail nevidíte,
              skontrolujte aj priečinok Spam
              alebo Nevyžiadaná pošta.
            </p>

            <p>
              Ďakujeme.
            </p>

            <p>
              <strong>Keramický klub</strong>
            </p>
          `

        );


        return res.status(200).json({

          success: true,

          message:
            "Rezervácia bola úspešne vytvorená."

        });

      }


      return res.status(400).json({

        error:
          "Neznámy typ registrácie."

      });


    } catch (error) {

      console.error(error);

      return res.status(500).json({

        error:
          "Nastala chyba pri spracovaní registrácie."

      });

    }

  }


  return res.status(405).json({

    error:
      "Metóda nie je povolená."

  });

}