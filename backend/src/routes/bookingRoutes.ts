import { Router } from "express";
import { pool } from "../db.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", async (req: AuthRequest, res) => {
  const client = await pool.connect();

  try {
    const { showId, seatIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    await client.query("BEGIN");

    const seats = await client.query(
      `
      SELECT seat_id, status
      FROM show_seats
      WHERE show_id = $1
        AND seat_id = ANY($2)
      FOR UPDATE
      `,
      [showId, seatIds]
    );

    if (
      seats.rows.length !== seatIds.length ||
      seats.rows.some((seat) => seat.status !== "AVAILABLE")
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "One or more seats are not available"
      });
    }

    const booking = await client.query(
      `
      INSERT INTO bookings (user_id, show_id, status)
      VALUES ($1, $2, 'CONFIRMED')
      RETURNING id, user_id, show_id, status, created_at
      `,
      [userId, showId]
    );

    const bookingId = booking.rows[0].id;

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

    await client.query(
      `
      UPDATE show_seats
      SET status = 'BOOKED'
      WHERE show_id = $1
        AND seat_id = ANY($2)
      `,
      [showId, seatIds]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Booking successful",
      booking: booking.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Booking failed"
    });

  } finally {
    client.release();
  }
});


router.delete("/:bookingId", async (req: AuthRequest, res) => {
  const client = await pool.connect();

  try {
    const { bookingId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    await client.query("BEGIN");

    const booking = await client.query(
      `
      SELECT id, user_id, show_id, status
      FROM bookings
      WHERE id = $1
        AND user_id = $2
      FOR UPDATE
      `,
      [bookingId, userId]
    );

    if (booking.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Booking not found"
      });
    }

    if (booking.rows[0].status !== "CONFIRMED") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Booking cannot be cancelled"
      });
    }

    const showId = booking.rows[0].show_id;

    const seats = await client.query(
      `
      SELECT seat_id
      FROM booking_seats
      WHERE booking_id = $1
        AND show_id = $2
      `,
      [bookingId, showId]
    );

    const seatIds = seats.rows.map((seat) => seat.seat_id);

    if (seatIds.length > 0) {
      await client.query(
        `
        SELECT seat_id
        FROM show_seats
        WHERE show_id = $1
          AND seat_id = ANY($2)
        FOR UPDATE
        `,
        [showId, seatIds]
      );

      await client.query(
        `
        UPDATE show_seats
        SET status = 'AVAILABLE'
        WHERE show_id = $1
          AND seat_id = ANY($2)
        `,
        [showId, seatIds]
      );
    }

    await client.query(
      `
      UPDATE bookings
      SET status = 'CANCELLED'
      WHERE id = $1
      `,
      [bookingId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Booking cancelled successfully",
      bookingId,
      releasedSeats: seatIds
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Cancellation failed"
    });

  } finally {
    client.release();
  }
});


export default router;