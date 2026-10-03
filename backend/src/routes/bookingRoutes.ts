import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId, showId, seatIds } = req.body;

    // Start transaction
    await client.query("BEGIN");

    // 1. Check requested seats
    const seats = await client.query(
      `
      SELECT seat_id, status
      FROM show_seats
      WHERE show_id = $1
        AND seat_id = ANY($2)
      `,
      [showId, seatIds]
    );

    // 2. Make sure ALL requested seats are available
    if (
      seats.rows.length !== seatIds.length ||
      seats.rows.some((seat) => seat.status !== "AVAILABLE")
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "One or more seats are not available"
      });
    }

    // 3. Create booking
    const booking = await client.query(
      `
      INSERT INTO bookings (user_id, show_id, status)
      VALUES ($1, $2, 'CONFIRMED')
      RETURNING id, user_id, show_id, status, created_at
      `,
      [userId, showId]
    );

    const bookingId = booking.rows[0].id;

    // 4. Create booking_seats
    for (const seatId of seatIds) {
      await client.query(
        `
        INSERT INTO booking_seats
        (booking_id, show_id, seat_id, price_paid)
        VALUES ($1, $2, $3, $4)
        `,
        [bookingId, showId, seatId, 250]
      );
    }

    // 5. Mark seats as BOOKED
    await client.query(
      `
      UPDATE show_seats
      SET status = 'BOOKED'
      WHERE show_id = $1
        AND seat_id = ANY($2)
      `,
      [showId, seatIds]
    );

    // Everything succeeded
    await client.query("COMMIT");

    res.status(201).json({
      message: "Booking successful",
      booking: booking.rows[0]
    });

  } catch (error) {
    // Something failed → undo everything
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Booking failed"
    });
  } finally {
    // Return connection to the pool
    client.release();
  }
});

export default router;