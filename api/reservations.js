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

/* WORKSHOPY PRE DOSPELÝCH – ROK NA GEMERI */
const WORKSHOPS = {
  "2026-11-18": {
    date: "18. 11. 2026",
    title: "Modrotlač",
    lecturer: "Mišena Juhász",
    price: 15
  },
  "2026-11-19": {
    date: "19. 11. 2026",
    title: "Čaro lineckých koláčikov",
    lecturer: "Anna Lachová",
    price: 10
  }
};
const WORKSHOP_CAPACITY = 10;



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
   AKTÍVNE PODUJATIA Z ADMINISTRÁCIE
   ========================================================= */

async function getPublicEvents() {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  };

  const [eventsResponse, sectionsResponse] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/events?select=id,event_group_id,section_title,title,instructor,event_date,start_time,end_time,price,capacity,active&active=eq.true&order=event_date.asc,start_time.asc`,
      { headers }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/event_sections?select=name&active=eq.true`,
      { headers }
    )
  ]);

  if (!eventsResponse.ok) {
    const text = await eventsResponse.text();
    console.error("Supabase events error:", text);
    throw new Error("Nepodarilo sa načítať podujatia.");
  }
  if (!sectionsResponse.ok) {
    const text = await sectionsResponse.text();
    console.error("Supabase event sections error:", text);
    throw new Error("Nepodarilo sa načítať sekcie podujatí.");
  }

  const [events, sections] = await Promise.all([
    eventsResponse.json(),
    sectionsResponse.json()
  ]);
  const activeSections = new Set(sections.map(section => section.name));

  // Verejnosť vidí iba podujatia patriace do aktívnych sekcií.
  return events.filter(event => activeSections.has(event.section_title));
}


/* =========================================================
   ROZPOZNANIE REZERVÁCIE KERAMICKÉHO KLUBU
   ========================================================= */

function getClubTermLabel(dateValue) {

  if (CLUB_TERMS.includes(dateValue)) {
    return dateValue;
  }

  return (
    CLUB_TERMS.find(
      term => CLUB_TERM_DATES[term] === dateValue
    ) || null
  );

}


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
    getClubTermLabel(item.date) &&
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

      const [reservations, publicEvents] = await Promise.all([
        getReservations(),
        getPublicEvents()
      ]);


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

            const termLabel =
              getClubTermLabel(item.date);


            if (!termLabel) {
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
                club[termLabel][hourText] !==
                undefined
              ) {

                club[termLabel][hourText]++;

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

      const workshops = {};
      for (const date of Object.keys(WORKSHOPS)) {
        workshops[date] = reservations.filter(
          item => item.type === "workshop" && item.date === date
        ).length;
      }

      const events = publicEvents.map(event => {
        const reserved = reservations.filter(
          item => item.event_id === event.id
        ).length;
        return {
          ...event,
          reserved,
          available: Math.max(0, Number(event.capacity || 0) - reserved)
        };
      });

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

        },

        workshops,

        events

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

        end_time,

        event_id

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
       * DYNAMICKÉ PODUJATIA VYTVORENÉ V ADMINISTRÁCII.
       * Verejné prihlásenie bez účtu; cenu, termín a kapacitu
       * vždy načítavame zo Supabase, nie z údajov prehliadača.
       */
      if (type === "workshop" && event_id) {
        const eventResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/events?select=id,section_title,title,instructor,event_date,start_time,end_time,price,capacity,active&id=eq.${encodeURIComponent(event_id)}&active=eq.true&limit=1`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            }
          }
        );

        if (!eventResponse.ok) {
          console.error("Event lookup error:", await eventResponse.text());
          return res.status(500).json({ error: "Podujatie sa nepodarilo overiť." });
        }

        const eventRows = await eventResponse.json();
        const event = eventRows[0];

        if (!event) {
          return res.status(400).json({ error: "Vybraný termín už nie je dostupný." });
        }

        const eventDate = String(event.event_date).slice(0, 10);
        const eventStart = String(event.start_time).slice(0, 5);
        const eventEnd = event.end_time ? String(event.end_time).slice(0, 5) : null;

        if (getTodayBratislava() > eventDate) {
          return res.status(400).json({ error: "Tento termín sa už uskutočnil." });
        }

        const reservations = await getReservations();
        const count = reservations.filter(item => item.event_id === event.id).length;
        const capacity = Number(event.capacity);

        if (count >= capacity) {
          return res.status(400).json({ error: "Tento termín je už plne obsadený." });
        }

        const place = count + 1;
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
              type: "workshop",
              event_id: event.id,
              name,
              phone,
              email,
              date: eventDate,
              start_time: eventStart,
              end_time: eventEnd,
              course_place: null,
              user_id: null
            })
          }
        );

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          console.error("Dynamic event reservation insert error:", errorText);
          return res.status(500).json({ error: "Rezerváciu sa nepodarilo uložiť." });
        }

        const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[char]));
        const eventDateSk = eventDate.split("-").reverse().join(". ");
        const timeLabel = eventEnd ? `${eventStart} – ${eventEnd}` : eventStart;
        const sectionName = safe(event.section_title || "Podujatie");
        const eventTitle = safe(event.title);
        const instructor = safe(event.instructor || "Neuvedený");
        const price = Number(event.price).toLocaleString("sk-SK");

        await sendEmail(
          "renata.ksenicova@gos.sk",
          `Nová rezervácia – ${event.title}`,
          `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#302923">
            <h2>Nová rezervácia – ${eventTitle}</h2>
            <p><strong>Sekcia:</strong> ${sectionName}</p>
            <p><strong>Podujatie:</strong> ${eventTitle}</p>
            <p><strong>Dátum:</strong> ${eventDateSk}</p>
            <p><strong>Čas:</strong> ${timeLabel}</p>
            <p><strong>Lektor/ka:</strong> ${instructor}</p>
            <p><strong>Meno:</strong> ${safe(name)}</p>
            <p><strong>Telefón:</strong> ${safe(phone)}</p>
            <p><strong>E-mail:</strong> ${safe(email)}</p>
            <p><strong>Cena:</strong> ${price} €</p>
            <p><strong>Obsadené miesto:</strong> ${place}/${capacity}</p>
          </div>`
        );

        await sendEmail(
          email,
          `Potvrdenie rezervácie – ${event.title}`,
          `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;color:#302923;line-height:1.65">
            <h2>Ďakujeme za vašu rezerváciu!</h2>
            <p>Vaša rezervácia bola prijatá.</p>
            <div style="background:#f7eee7;padding:18px;border-radius:12px;margin:20px 0">
              <p><strong>Sekcia:</strong> ${sectionName}</p>
              <p><strong>Podujatie:</strong> ${eventTitle}</p>
              <p><strong>Dátum:</strong> ${eventDateSk}</p>
              <p><strong>Čas:</strong> ${timeLabel}</p>
              <p><strong>Lektor/ka:</strong> ${instructor}</p>
              <p><strong>Cena:</strong> ${price} €</p>
            </div>
            <p>Tešíme sa na vás!</p>
            <p style="font-size:13px;color:#8a786b">Ak potvrdzovací e-mail nevidíte, skontrolujte aj priečinok Spam alebo Nevyžiadaná pošta.</p>
          </div>`
        );

        return res.status(200).json({
          success: true,
          message: "Vaša rezervácia bola úspešná."
        });
      }


      /*
       * WORKSHOPY PRE DOSPELÝCH – verejné prihlásenie bez účtu
       */
      if (type === "workshop") {
        const workshop = WORKSHOPS[date];

        if (!workshop) {
          return res.status(400).json({ error: "Vyberte platný workshop." });
        }

        if (getTodayBratislava() > date) {
          return res.status(400).json({ error: "Tento workshop sa už uskutočnil." });
        }

        const reservations = await getReservations();
        const count = reservations.filter(
          item => item.type === "workshop" && item.date === date
        ).length;

        if (count >= WORKSHOP_CAPACITY) {
          return res.status(400).json({ error: "Tento workshop je už plne obsadený." });
        }

        const place = count + 1;
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
              type: "workshop",
              name,
              phone,
              email,
              date,
              start_time: null,
              end_time: null,
              course_place: null,
              user_id: null
            })
          }
        );

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          console.error("Workshop insert error:", errorText);
          return res.status(500).json({ error: "Prihlásenie na workshop sa nepodarilo uložiť." });
        }

        const safe = value => String(value).replace(/[&<>"]/g, char => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
        }[char]));

        await sendEmail(
          "renata.ksenicova@gos.sk",
          `Nová rezervácia – ${workshop.title}`,
          `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#302923">
            <h2>Nová rezervácia – Workshopy pre dospelých: Rok na Gemeri</h2>
            <p><strong>Workshop:</strong> ${workshop.title}</p>
            <p><strong>Dátum:</strong> ${workshop.date}</p>
            <p><strong>Začiatok:</strong> 17:00</p>
            <p><strong>Lektorka:</strong> ${workshop.lecturer}</p>
            <p><strong>Meno:</strong> ${safe(name)}</p>
            <p><strong>Telefón:</strong> ${safe(phone)}</p>
            <p><strong>E-mail:</strong> ${safe(email)}</p>
            <p><strong>Cena:</strong> ${workshop.price} €</p>
            <p><strong>Obsadené miesto:</strong> ${place}/10</p>
          </div>`
        );

        await sendEmail(
          email,
          `Potvrdenie rezervácie – ${workshop.title}`,
          `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;color:#302923;line-height:1.65">
            <h2>Ďakujeme za vašu rezerváciu!</h2>
            <p>Vaša rezervácia na workshop v rámci cyklu <strong>Rok na Gemeri</strong> bola prijatá.</p>
            <div style="background:#f7eee7;padding:18px;border-radius:12px;margin:20px 0">
              <p><strong>Workshop:</strong> ${workshop.title}</p>
              <p><strong>Dátum:</strong> ${workshop.date}</p>
              <p><strong>Začiatok:</strong> 17:00</p>
              <p><strong>Cena:</strong> ${workshop.price} €</p>
            </div>
            <p>Tešíme sa na vás!</p>
            <p style="font-size:13px;color:#8a786b">Ak potvrdzovací e-mail nevidíte, skontrolujte aj priečinok Spam alebo Nevyžiadaná pošta.</p>
          </div>`
        );

        return res.status(200).json({
          success: true,
          message: "Vaša rezervácia na workshop bola úspešná."
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

        const clubTermLabel =
          getClubTermLabel(date);


        if (!clubTermLabel) {

          return res.status(400).json({

            error:
              "Neplatný termín."

          });

        }


        const clubDateIso =
          CLUB_TERM_DATES[clubTermLabel];


        /*
         * -----------------------------------------------
         * 5. MINULÉ TERMÍNY
         * -----------------------------------------------
         */

        if (
          !isClubDateAvailable(clubTermLabel)
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
            item => {

              if (!isClubReservation(item)) {
                return false;
              }


              return (
                getClubTermLabel(item.date) ===
                clubTermLabel
              );

            }
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

                date:
                  clubDateIso,

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
              ${clubTermLabel}
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
                ${clubTermLabel}
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
