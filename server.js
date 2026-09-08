require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const db = new Database("reservations.db");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,

    date TEXT NOT NULL,
    notes TEXT,

    amount INTEGER NOT NULL DEFAULT 700,

    status TEXT NOT NULL DEFAULT 'pending',

    stripe_session_id TEXT,
    stripe_payment_intent TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/*
|--------------------------------------------------------------------------
| EMAIL
|--------------------------------------------------------------------------
*/

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/*
|--------------------------------------------------------------------------
| SEND CUSTOMER EMAIL
|--------------------------------------------------------------------------
*/

async function sendCustomerConfirmation(reservation) {
  if (!transporter) {
    console.log("SMTP nie je nastavené – zákaznícky e-mail sa neposlal.");
    return;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM,

    to: reservation.email,

    subject: "Rezervácia potvrdená – Kreatívny krúžok",

    text: `
Ahoj ${reservation.name},

tvoja rezervácia bola úspešne potvrdená.

Kreatívny krúžok
----------------------------

Meno:
${reservation.name}

Termín:
${reservation.date}

Cena:
7,00 €

Číslo rezervácie:
${reservation.id}

Ďakujeme za rezerváciu.

Tešíme sa na teba!
`
  });
}

/*
|--------------------------------------------------------------------------
| SEND ADMIN EMAIL
|--------------------------------------------------------------------------
*/

async function sendAdminNotification(reservation) {
  if (!transporter || !process.env.ADMIN_EMAIL) {
    return;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM,

    to: process.env.ADMIN_EMAIL,

    subject: `Nová rezervácia #${reservation.id}`,

    text: `
Nová zaplatená rezervácia.

Číslo:
${reservation.id}

Meno:
${reservation.name}

E-mail:
${reservation.email}

Telefón:
${reservation.phone || "-"}

Termín:
${reservation.date}

Poznámka:
${reservation.notes || "-"}

Cena:
7,00 €
`
  });
}

/*
|--------------------------------------------------------------------------
| STRIPE WEBHOOK
|
| DÔLEŽITÉ:
| Webhook musí byť pred express.json(),
| pretože Stripe potrebuje raw body.
|--------------------------------------------------------------------------
*/

app.post(
  "/api/stripe-webhook",

  express.raw({
    type: "application/json"
  }),

  async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).send("Stripe nie je nakonfigurovaný.");
      }

      const signature = req.headers["stripe-signature"];

      const event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const reservation = db
          .prepare(
            `
            SELECT *
            FROM reservations
            WHERE stripe_session_id = ?
            `
          )
          .get(session.id);

        if (reservation && reservation.status !== "paid") {
          db.prepare(
            `
            UPDATE reservations
            SET
              status = 'paid',
              stripe_payment_intent = ?
            WHERE id = ?
            `
          ).run(
            session.payment_intent || null,
            reservation.id
          );

          const updatedReservation = {
            ...reservation,
            status: "paid",
            stripe_payment_intent: session.payment_intent || null
          };

          try {
            await sendCustomerConfirmation(updatedReservation);
          } catch (emailError) {
            console.error(
              "Chyba pri odosielaní zákazníckeho e-mailu:",
              emailError
            );
          }

          try {
            await sendAdminNotification(updatedReservation);
          } catch (emailError) {
            console.error(
              "Chyba pri odosielaní admin e-mailu:",
              emailError
            );
          }
        }
      }

      res.json({
        received: true
      });
    } catch (error) {
      console.error("Stripe webhook error:", error);

      res.status(400).send(
        `Webhook Error: ${error.message}`
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| NORMAL JSON API
|--------------------------------------------------------------------------
*/

app.use(express.json());

/*
|--------------------------------------------------------------------------
| STATIC WEBSITE
|--------------------------------------------------------------------------
*/

app.use(express.static(path.join(__dirname, "public")));

/*
|--------------------------------------------------------------------------
| CREATE CHECKOUT
|--------------------------------------------------------------------------
*/

app.post("/api/create-checkout", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        error: "Stripe nie je nakonfigurovaný."
      });
    }

    const {
      name,
      email,
      phone,
      date,
      notes
    } = req.body;

    /*
    | Basic validation
    */

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Zadaj meno a priezvisko."
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        error: "Zadaj e-mail."
      });
    }

    if (!date || !date.trim()) {
      return res.status(400).json({
        error: "Vyber termín."
      });
    }

    /*
    | Create reservation
    */

    const result = db
      .prepare(
        `
        INSERT INTO reservations
        (
          name,
          email,
          phone,
          date,
          notes,
          amount,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        name.trim(),
        email.trim(),
        phone || "",
        date.trim(),
        notes || "",
        700,
        "pending"
      );

    const reservationId = result.lastInsertRowid;

    /*
    | Create Stripe Checkout Session
    */

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["card"],

      customer_email: email.trim(),

      line_items: [
        {
          price_data: {
            currency: "eur",

            product_data: {
              name: "Kreatívny krúžok – rezervácia"
            },

            unit_amount: 700
          },

          quantity: 1
        }
      ],

      metadata: {
        reservation_id: String(reservationId)
      },

      success_url:
        `${BASE_URL}/success.html?reservation=${reservationId}`,

      cancel_url:
        `${BASE_URL}/cancel.html`
    });

    /*
    | Save Stripe session
    */

    db.prepare(
      `
      UPDATE reservations
      SET stripe_session_id = ?
      WHERE id = ?
      `
    ).run(
      session.id,
      reservationId
    );

    res.json({
      url: session.url
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Nepodarilo sa vytvoriť platbu."
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET RESERVATION
|--------------------------------------------------------------------------
*/

app.get("/api/reservation/:id", (req, res) => {
  const reservation = db
    .prepare(
      `
      SELECT
        id,
        name,
        email,
        phone,
        date,
        notes,
        amount,
        status,
        created_at
      FROM reservations
      WHERE id = ?
      `
    )
    .get(req.params.id);

  if (!reservation) {
    return res.status(404).json({
      error: "Rezervácia neexistuje."
    });
  }

  res.json(reservation);
});

/*
|--------------------------------------------------------------------------
| ADMIN AUTH
|--------------------------------------------------------------------------
*/

function adminAuth(req, res, next) {
  const token = req.headers.authorization;

  if (
    !process.env.ADMIN_TOKEN ||
    token !== `Bearer ${process.env.ADMIN_TOKEN}`
  ) {
    return res.status(401).json({
      error: "Neautorizované."
    });
  }

  next();
}

/*
|--------------------------------------------------------------------------
| ADMIN – RESERVATIONS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/admin/reservations",
  adminAuth,
  (req, res) => {

    const reservations = db
      .prepare(
        `
        SELECT *
        FROM reservations
        ORDER BY id DESC
        `
      )
      .all();

    res.json(reservations);
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN – DELETE
|--------------------------------------------------------------------------
*/

app.delete(
  "/api/admin/reservations/:id",
  adminAuth,
  (req, res) => {

    const result = db
      .prepare(
        `
        DELETE FROM reservations
        WHERE id = ?
        `
      )
      .run(req.params.id);

    if (!result.changes) {
      return res.status(404).json({
        error: "Rezervácia neexistuje."
      });
    }

    res.json({
      success: true
    });
  }
);

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log("");
  console.log("=================================");
  console.log(" KRUŽOK REZERVAČNÝ SYSTÉM");
  console.log("=================================");
  console.log("");
  console.log(`Web: ${BASE_URL}`);
  console.log("");
});