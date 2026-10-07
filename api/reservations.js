```javascript
const SUPABASE_URL =
  "https://udrkkbpsfsbuvojzqfjm.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_cxg93Fv-VJz7W8h5sTh9Aw_bMqW0feT";

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;


/* =========================================================
   TERMÍNY KERAMICKÉHO KLUBU
   ========================================================= */

const CLUB_TERMS = [
  "1. október",
  "15. október",
  "29. október",
  "12. november",
  "26. november",
  "10. december"
];


const CLUB_TERM_DATES = {
  "1. október": "2026-10-01",
  "15. október": "2026-10-15",
  "29. október": "2026-10-29",
  "12. november": "2026-11-12",
  "26. november": "2026-11-26",
  "10. december": "2026-12-10"
};


const CLUB_START_TIMES = [
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00"
];


const CLUB_END_TIMES = [
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00"
];


/* =========================================================
   SUPABASE – NAČÍTANIE REZERVÁCIÍ
   ========================================================= */

async function getReservations() {

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization:
            `Bearer ${SUPABASE_KEY}`
        }
      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    console.error(
      "Supabase reservations error:",
      text
    );

    throw new Error(
      "Nepodarilo sa načítať rezervácie."
    );

  }


  return await response.json();

}


/* =========================================================
   OVERENIE SUPABASE POUŽÍVATEĽA
   ========================================================= */

async function getAuthenticatedUser(
  authorizationHeader
) {

  if (
    !authorizationHeader ||
    !authorizationHeader.startsWith("Bearer ")
  ) {

    return null;

  }


  const accessToken =
    authorizationHeader.substring(
      "Bearer ".length
    ).trim();


  if (!accessToken) {
    return null;
  }


  /*
   * Token overujeme priamo cez Supabase Auth.
   *
   * Nepoužívame údaje z prehliadača ako dôkaz,
   * ale overujeme token na Supabase serveri.
   */

  const response =
    await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_KEY,

          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );


  if (!response.ok) {

    return null;

  }


  const user =
    await response.json();


  if (!user || !user.id) {

    return null;

  }


  return {
    user,
    accessToken
  };

}


/* =========================================================
   OVERENIE ČLENA KERAMICKÉHO KLUBU
   ========================================================= */

async function getClubMemberStatus(
  userId,
  accessToken
) {

  /*
   * Čítame profil konkrétneho používateľa.
   */

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,club_member&id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_KEY,

          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    console.error(
      "Supabase profiles error:",
      text
    );

    throw new Error(
      "Nepodarilo sa overiť schválenie používateľa."
    );

  }


  const profiles =
    await response.json();


  if (
    !Array.isArray(profiles) ||
    profiles.length === 0
  ) {

    return false;

  }


  return profiles[0].club_member === true;

}


/* =========================================================
   AKTUÁLNY DÁTUM – EUROPE/BRATISLAVA
   ========================================================= */

function getTodayBratislava() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Europe/Bratislava",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());


  const year =
    parts.find(
      part => part.type === "year"
    )?.value;


  const month =
    parts.find(
      part => part.type === "month"
    )?.value;


  const day =
    parts.find(
      part => part.type === "day"
    )?.value;


  return `${year}-${month}-${day}`;

}


/* =========================================================
   KONTROLA TERMÍNU KLUBU
   ========================================================= */

function isClubDateAvailable(
  dateLabel
) {

  const termDate =
    CLUB_TERM_DATES[dateLabel];


  if (!termDate) {

    return false;

  }


  const today =
    getTodayBratislava();


  /*
   * Termín je dostupný celý deň,
   * ak je dnes presne jeho dátum.
   *
   * Od ďalšieho dňa už nie.
   */

  return termDate >= today;

}


/* =========================================================
   EMAIL – RESEND
   ========================================================= */

async function sendEmail(
  to,
  subject,
  html
) {

  if (!RESEND_API_KEY) {

    console.warn(
      "RESEND_API_KEY nie je nastavený."
    );

    return;

  }


  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          from:
            "Keramický klub <rezervacie@keramickyklub.site>",

          to: [to],

          subject,

          html

        })

      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    console.error(
      "Resend error:",
      text
    );

  }

}


/* =========================================================
   GET
   NAČÍTANIE DOSTUPNOSTI
   ========================================================= */

export default async function handler(
  req,
  res
) {

  /*
   * =======================================================
   * GET
   * =======================================================
   */

  if (req.method === "GET") {

    try {

      const reservations =
        await getReservations();


      const club = {};


      CLUB_TERMS.forEach(
        term => {

          club[term] = {};


          CLUB_START_TIMES.forEach(
            hour => {

              club[term][hour] = 0;

            }
          );

        }
      );


      /*
       * Spočítame obsadenosť jednotlivých hodín.
       */

      reservations

        .filter(
          item =>
            item.type === "club"
        )

        .forEach(
          item => {

            if (!club[item.date]) {
              return;
            }


            if (
              !item.start_time ||
              !item.end_time
            ) {

              return;

            }


            const startHour =
              parseInt(
                item.start_time.substring(
                  0,
                  2
                )
              );


            const endHour =
              parseInt(
                item.end_time.substring(
                  0,
                  2
                )
              );


            for (
              let hour = startHour;
              hour < endHour;
              hour++
            ) {

              const hourText =
                String(hour)
                  .padStart(2, "0") +
                ":00";


              if (
                club[item.date][hourText] !==
                undefined
              ) {

                club[item.date][hourText]++;

              }

            }

          }
        );


      /*
       * Spočítame počet prihlásených na kurz.
       */

      const courseReservations =
        reservations.filter(
          item =>
            item.type === "course"
        ).length;


      return res.status(200).json({

        club,

        course: {

          reserved:
            courseReservations,

          available:
            Math.max(
              0,
              7 - courseReservations
            )

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


  /*
   * =======================================================
   * POST
   * =======================================================
   */

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

      } = req.body || {};


      /*
       * ===================================================
       * ZÁKLADNÁ KONTROLA ÚDAJOV
       * ===================================================
       */

      if (
        !name ||
        !phone ||
        !email
      ) {

        return res.status(400).json({

          error:
            "Vyplňte všetky údaje."

        });

      }


      /*
       * ===================================================
       * KERAMICKÝ KURZ
       *
       * Kurz zostáva verejný.
       * Prihlásenie nie je potrebné.
       * ===================================================
       */

      if (type === "course") {

        const reservations =
          await getReservations();


        const courseReservations =
          reservations.filter(
            item =>
              item.type === "course"
          );


        /*
         * MAXIMÁLNE 7 ĽUDÍ
         */

        if (
          courseReservations.length >= 7
        ) {

          return res.status(400).json({

            error:
              "Keramický kurz je už plne obsadený."

          });

        }


        const place =
          courseReservations.length + 1;


        /*
         * ULOŽENIE REZERVÁCIE
         */

        const insertResponse =
          await fetch(
            `${SUPABASE_URL}/rest/v1/reservations`,
            {
              method: "POST",

              headers: {

                apikey:
                  SUPABASE_KEY,

                Authorization:
                  `Bearer ${SUPABASE_KEY}`,

                "Content-Type":
                  "application/json",

                Prefer:
                  "return=minimal"

              },

              body: JSON.stringify({

                type:
                  "course",

                name,

                phone,

                email,

                date:
                  "13. október – 1. december",

                start_time:
                  null,

                end_time:
                  null,

                course_place:
                  place,

                user_id:
                  null

              })

            }
          );


        if (!insertResponse.ok) {

          const errorText =
            await insertResponse.text();

          console.error(
            errorText
          );


          return res.status(500).json({

            error:
              "Registráciu na kurz sa nepodarilo uložiť."

          });

        }


        /*
         * EMAIL ORGANIZÁTOROVI
         */

        await sendEmail(

          "renata.ksenicova@gos.sk",

          "Nová prihláška – Keramický kurz",

          `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 650px;
            margin: 0 auto;
            color: #302923;
            line-height: 1.6;
          ">

            <h2>
              Nová prihláška na keramický kurz
            </h2>

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
              13. október 2026 – 1. december 2026
            </p>

            <p>
              <strong>Počet lekcií:</strong> 8
            </p>

            <p>
              <strong>Celkový rozsah:</strong> 24 hodín
            </p>

            <p>
              <strong>Deň a čas:</strong>
              každý utorok od 16:00 do 19:00
            </p>

            <p>
              <strong>Miesto:</strong>
              Dom tradičnej kultúry Gemera,
              Betliarska 8, Rožňava
            </p>

            <p>
              <