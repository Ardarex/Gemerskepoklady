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
   ROZPOZNANIE REZERVÁCIE KERAMICKÉHO KLUBU
   ========================================================= */

function isClubReservation(item) {

  /*
   * Nové rezervácie majú type = "club".
   * Staršie rezervácie vytvorené pred pridaním stĺpca type
   * ho môžu mať prázdny. Ak majú platný klubový termín a čas,
   * považujeme ich tiež za rezervácie Keramického klubu.
   */

  if (item.type === "club") {
    return true;
  }

  if (
    !item.type &&
    CLUB_TERMS.includes(item.date) &&
    item.start_time &&
    item.end_time
  ) {
    return true;
  }

  return false;

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
    throw new Error("RESEND_API_KEY nie je nastavený vo Verceli.");
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

    throw new Error(`Resend chyba: ${text}`);

  }

  return await response.text();

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

        .filter(item => isClubReservation(item))

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
              <strong>Cena:</strong> 170 €
            </p>

            <p>
              <strong>Miesto účastníka:</strong>
              ${place}/7
            </p>

          </div>
          `

        );


        /*
         * POTVRDZOVACÍ EMAIL ÚČASTNÍKOVI
         */

        await sendEmail(

          email,

          "Potvrdenie prihlásenia – Keramický kurz",

          `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 650px;
            margin: 0 auto;
            color: #302923;
            line-height: 1.65;
            font-size: 15px;
          ">

            <h2 style="color:#352c27;">
              Ďakujeme za vašu rezerváciu na kurz keramiky. 😊
            </h2>

            <p>
              Tešíme sa, že sa spolu stretneme pri tvorení
              a objavovaní sveta keramickej tvorby.
            </p>


            <div style="
              background:#f7eee7;
              padding:18px;
              border-radius:12px;
              margin:20px 0;
            ">

              <p>
                <strong>Termín kurzu:</strong>
                13. 10. 2026 – 1. 12. 2026
              </p>

              <p>
                <strong>Počet lekcií:</strong>
                8
              </p>

              <p>
                <strong>Celkový rozsah:</strong>
                24 hodín
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
                <strong>Vaše miesto:</strong>
                ${place}/7
              </p>

            </div>


            <p>
              Počas kurzu sa pod vedením lektorky
              Renáty Kseničovej naučíte základné techniky
              modelovania z hrnčiarskej hliny, dekorovania,
              glazovania a postupy finálneho výpalu.
            </p>

            <p>
              Postupne si vytvoríte rôzne dekoračné aj
              úžitkové predmety a zároveň budete mať priestor
              objavovať vlastnú tvorivosť.
            </p>

            <p>
              Inšpiráciou nám budú aj rôzne tematické obdobia
              počas roka – napríklad jeseň či Vianoce.
            </p>


            <h3 style="color:#352c27;">
              Cena kurzu: 170 €
            </h3>


            <p>
              <strong>Cena zahŕňa:</strong>
            </p>

            <ul>
              <li>materiál,</li>
              <li>pracovné pomôcky,</li>
              <li>uskladnenie výrobkov počas sušenia,</li>
              <li>2× výpal v elektrickej peci,</li>
              <li>malé občerstvenie,</li>
              <li>certifikát o absolvovaní kurzu.</li>
            </ul>


            <h3 style="color:#352c27;">
              Úhrada poplatku
            </h3>

            <p>
              Rezervácia je záväzná.
              Poplatok je potrebné uhradiť
              najneskôr 3 dni pred začiatkom kurzu.
            </p>

            <p>
              Platbu môžete uhradiť:
            </p>

            <ul>
              <li>v hotovosti na mieste,</li>

              <li>
                platobnou kartou na mieste,
              </li>

              <li>
                bankovým prevodom na účet
                <strong>
                  SK31 8180 0000 0070 0046 1781
                </strong>
              </li>
            </ul>


            <h3 style="color:#352c27;">
              Zrušenie rezervácie
            </h3>

            <p>
              Ak sa kurzu nebudete môcť zúčastniť,
              prosíme vás o včasné zrušenie rezervácie
              telefonicky na čísle
              <strong>0917 419 259</strong>
              alebo e-mailom na adrese
              <strong>renata.ksenicova@gos.sk</strong>.
            </p>

            <p>
              Uvoľnené miesto tak môžeme ponúknuť
              ďalším záujemcom.
            </p>

            <p>
              Ďakujeme za pochopenie.
            </p>

            <h3>
              Tešíme sa na spoločné tvorenie! 👐🏻🏺
            </h3>


            <p style="
              color:#8a786b;
              font-size:13px;
              margin-top:25px;
            ">
              Ak potvrdzovací e-mail nevidíte,
              skontrolujte aj priečinok Spam
              alebo Nevyžiadaná pošta.
            </p>

          </div>
          `

        );


        return res.status(200).json({

          success:
            true,

          message:
            "Prihlásenie na kurz bolo úspešné."

        });

      }


      /*
       * ===================================================
       * KERAMICKÝ KLUB
       * ===================================================
       */

      if (type === "club") {

        /*
         * -----------------------------------------------
         * 1. MUSÍ BYŤ PRIHLÁSENÝ
         * -----------------------------------------------
         */

        const auth =
          await getAuthenticatedUser(
            req.headers.authorization
          );


        if (!auth) {

          return res.status(401).json({

            error:
              "Pre rezerváciu Keramického klubu sa musíte prihlásiť alebo vytvoriť účet."

          });

        }


        const user =
          auth.user;


        const accessToken =
          auth.accessToken;


        /*
         * -----------------------------------------------
         * 2. MUSÍ MAŤ SCHVÁLENIE club_member
         * -----------------------------------------------
         */

        let isClubMember;


        try {

          isClubMember =
            await getClubMemberStatus(
              user.id,
              accessToken
            );

        } catch (error) {

          console.error(error);


          return res.status(500).json({

            error:
              "Nepodarilo sa overiť schválenie účtu."

          });

        }


        if (!isClubMember) {

          return res.status(403).json({

            error:
              "Váš účet ešte nemá schválenie pre Keramický klub."

          });

        }


        /*
         * -----------------------------------------------
         * 3. KONTROLA ÚDAJOV
         * -----------------------------------------------
         */

        if (
          !date ||
          !start_time ||
          !end_time
        ) {

          return res.status(400).json({

            error:
              "Vyberte termín a čas."

          });

        }


        /*
         * -----------------------------------------------
         * 4. KONTROLA TERMÍNU
         * -----------------------------------------------
         */

        if (
          !CLUB_TERMS.includes(date)
        ) {

          return res.status(400).json({

            error:
              "Neplatný termín."

          });

        }


        /*
         * -----------------------------------------------
         * 5. MINULÉ TERMÍNY
         * -----------------------------------------------
         */

        if (
          !isClubDateAvailable(date)
        ) {

          return res.status(400).json({

            error:
              "Tento termín už nie je dostupný."

          });

        }


        /*
         * -----------------------------------------------
         * 6. KONTROLA ČASU
         * -----------------------------------------------
         */

        if (
          !CLUB_START_TIMES.includes(
            start_time
          )
        ) {

          return res.status(400).json({

            error:
              "Neplatný začiatok času."

          });

        }


        if (
          !CLUB_END_TIMES.includes(
            end_time
          )
        ) {

          return res.status(400).json({

            error:
              "Neplatný koniec času."

          });

        }


        const startHour =
          parseInt(
            start_time.substring(
              0,
              2
            )
          );


        const endHour =
          parseInt(
            end_time.substring(
              0,
              2
            )
          );


        if (
          endHour <= startHour
        ) {

          return res.status(400).json({

            error:
              "Koncový čas musí byť neskôr ako začiatok."

          });

        }


        /*
         * -----------------------------------------------
         * 7. NAČÍTANIE EXISTUJÚCICH REZERVÁCIÍ
         * -----------------------------------------------
         */

        const reservations =
          await getReservations();


        const clubReservations =
          reservations.filter(
            item =>
              isClubReservation(item) &&
              item.date === date
          );


        /*
         * -----------------------------------------------
         * 8. KONTROLA 10 ĽUDÍ NA KAŽDÚ HODINU
         * -----------------------------------------------
         */

        for (
          let hour = startHour;
          hour < endHour;
          hour++
        ) {

          const hourStart =
            String(hour)
              .padStart(2, "0") +
            ":00";


          const hourEnd =
            String(hour + 1)
              .padStart(2, "0") +
            ":00";


          let peopleAtThisHour =
            0;


          clubReservations.forEach(
            item => {

              if (
                !item.start_time ||
                !item.end_time
              ) {

                return;

              }


              const existingStart =
                parseInt(
                  item.start_time.substring(
                    0,
                    2
                  )
                );


              const existingEnd =
                parseInt(
                  item.end_time.substring(
                    0,
                    2
                  )
                );


              /*
               * Rezervácia zaberá všetky hodiny,
               * cez ktoré prechádza.
               */

              if (
                existingStart <= hour &&
                existingEnd > hour
              ) {

                peopleAtThisHour++;

              }

            }
          );


          if (
            peopleAtThisHour >= 10
          ) {

            return res.status(400).json({

              error:
                `Čas ${hourStart} – ${hourEnd} je už plne obsadený. Vyberte si iný čas.`

            });

          }

        }


        /*
         * -----------------------------------------------
         * 9. ULOŽENIE REZERVÁCIE
         * -----------------------------------------------
         *
         * user_id je ID prihláseného používateľa.
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
                  "club",

                name,

                phone,

                email,

                date,

                start_time,

                end_time,

                course_place:
                  null,

                user_id:
                  user.id

              })

            }
          );


        if (!insertResponse.ok) {

          const errorText =
            await insertResponse.text();

          console.error(
            "Club insert error:",
            errorText
          );


          return res.status(500).json({

            error:
              "Rezerváciu sa nepodarilo uložiť."

          });

        }


        /*
         * -----------------------------------------------
         * 10. EMAIL ORGANIZÁTOROVI
         * -----------------------------------------------
         */

        await sendEmail(

          "renata.ksenicova@gos.sk",

          "Nová rezervácia – Keramický klub",

          `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 650px;
            margin: 0 auto;
            color: #302923;
            line-height: 1.6;
          ">

            <h2>
              Nová rezervácia – Keramický klub
            </h2>

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
              <strong>Čas:</strong>
              ${start_time} – ${end_time}
            </p>

            <p>
              <strong>Cena:</strong>
              7 € / osoba / hodina
            </p>

            <p>
              <strong>Supabase user ID:</strong>
              ${user.id}
            </p>

          </div>
          `

        );


        /*
         * -----------------------------------------------
         * 11. POTVRDZOVACÍ EMAIL ÚČASTNÍKOVI
         * -----------------------------------------------
         */

        await sendEmail(

          email,

          "Potvrdenie rezervácie – Keramický klub",

          `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 650px;
            margin: 0 auto;
            color: #302923;
            line-height: 1.65;
            font-size: 15px;
          ">

            <h2 style="color:#352c27;">
              Ďakujeme za vašu rezerváciu
              v Keramickom klube. 😊
            </h2>

            <p>
              Tešíme sa na spoločné tvorenie!
            </p>


            <div style="
              background:#f7eee7;
              padding:18px;
              border-radius:12px;
              margin:20px 0;
            ">

              <p>
                <strong>Termín:</strong>
                ${date}
              </p>

              <p>
                <strong>Čas:</strong>
                ${start_time} – ${end_time}
              </p>

              <p>
                <strong>Cena:</strong>
                7 € / osoba / hodina
              </p>

            </div>


            <p>
              Vaša rezervácia zahŕňa 1 miesto
              na tvorenie v keramickom klube vrátane
              všetkého potrebného materiálu a pomôcok.
            </p>


            <p>
              Počas celej dielne bude prítomný lektor,
              ktorý vás prevedie jednotlivými krokmi,
              vysvetlí postup práce a ochotne vám poradí
              alebo pomôže, ak to budete potrebovať.
            </p>


            <p>
              Počas vašej návštevy si môžete vychutnať
              kávu, čaj alebo malé občerstvenie.
            </p>


            <h3 style="color:#352c27;">
              Praktické informácie
            </h3>

            <p>
              Odporúčame prísť približne
              <strong>5 – 10 minút pred začiatkom</strong>
              rezervovaného času, aby ste sa stihli
              pohodlne usadiť a pripraviť na tvorenie.
            </p>


            <p>
              Ak si želáte tvoriť dlhšie,
              je potrebné rezervovať si ďalší časový slot.
              Prosíme, rešpektujte čas ukončenia vašej
              rezervácie, aby sme mohli pripraviť priestor
              pre ďalších účastníkov.
            </p>


            <h3 style="color:#352c27;">
              Cena
            </h3>

            <p>
              <strong>
                7 € / osoba / hodina
              </strong>
            </p>


            <h3 style="color:#352c27;">
              Platba
            </h3>

            <p>
              Platba prebieha na mieste
              v hotovosti alebo platobnou kartou.
            </p>


            <h3 style="color:#352c27;">
              Zrušenie rezervácie
            </h3>

            <p>
              Rezervácia je záväzná.
              Ak sa nebudete môcť zúčastniť,
              prosíme vás o včasné zrušenie rezervácie
              telefonicky na čísle
              <strong>0917 419 259</strong>
              alebo e-mailom na adrese
              <strong>renata.ksenicova@gos.sk</strong>.
            </p>

            <p>
              Uvoľnené miesto tak môžeme ponúknuť
              ďalším záujemcom.
            </p>


            <p>
              Ďakujeme za pochopenie
              a tešíme sa na vás! 👐🏻🏺
            </p>


            <p>
              <strong>
                Tím Keramického klubu
              </strong>
            </p>


            <p style="
              color:#8a786b;
              font-size:13px;
              margin-top:25px;
            ">
              Ak potvrdzovací e-mail nevidíte,
              skontrolujte aj priečinok Spam
              alebo Nevyžiadaná pošta.
            </p>

          </div>
          `

        );


        /*
         * -----------------------------------------------
         * 12. ÚSPECH
         * -----------------------------------------------
         */

        return res.status(200).json({

          success:
            true,

          message:
            "Rezervácia bola úspešne vytvorená."

        });

      }


      /*
       * ===================================================
       * NEZNÁMY TYP
       * ===================================================
       */

      return res.status(400).json({

        error:
          "Neznámy typ registrácie."

      });


    } catch (error) {

      console.error(
        "API error:",
        error
      );


      return res.status(500).json({

        error:
          "Nastala chyba pri spracovaní registrácie."

      });

    }

  }


  /*
   * =======================================================
   * OSTATNÉ HTTP METÓDY
   * =======================================================
   */

  return res.status(405).json({

    error:
      "Metóda nie je povolená."

  });

}
``