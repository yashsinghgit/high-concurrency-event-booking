
import { Router } from "express";
import { pool } from "../db.js";
import { AuthRequest } from "../middleware/authMiddleware.js";
import { createHash } from "node:crypto";

const router = Router();

// CREATE BOOKING
router.post("/", async (req: AuthRequest, res) => {
  const { showId, seatIds } = req.body;
  const userId = req.user?.userId;
  const idempotencyKey = req.header("Idempotency-Key")?.trim();

  // Authentication
  if (!userId) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  // Validate showId
  const parsedShowId = Number(showId);

  if (!Number.isInteger(parsedShowId) || parsedShowId <= 0) {
    return res.status(400).json({
      message: "showId must be a positive integer",
    });
  }

  // Validate seatIds
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({
      message: "seatIds must be a non-empty array",
    });
  }

  const parsedSeatIds = seatIds.map(Number);

  if (
    parsedSeatIds.some(
      (seatId) => !Number.isSafeInteger(seatId) || seatId <= 0
    )
  ) {
    return res.status(400).json({
      message: "seatIds must contain only positive integers",
    });
  }

  if (new Set(parsedSeatIds).size !== parsedSeatIds.length) {
    return res.status(400).json({
      message: "Duplicate seat IDs are not allowed",
    });
  }

  // Validate idempotency key
  if (!idempotencyKey) {
    return res.status(400).json({
      message: "Idempotency-Key header is required",
    });
  }

  if (idempotencyKey.length > 255) {
    return res.status(400).json({
      message: "Idempotency-Key must not exceed 255 characters",
    });
  }

  // Hash a normalized request so seat order doesn't matter.
  const normalizedSeatIds = [...parsedSeatIds].sort((a, b) => a - b);

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        showId: parsedShowId,
        seatIds: normalizedSeatIds,
      })
    )
    .digest("hex");

  // Acquire a database connection only after validation.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Attempt to claim this user's idempotency key.
    const idempotency = await client.query(
      `
      INSERT INTO idempotency_records
        (user_id, idempotency_key, request_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id
      `,
      [userId, idempotencyKey, requestHash]
    );

    // The key already exists: inspect the original operation.
    if (idempotency.rows.length === 0) {
      const existingResult = await client.query(
        `
        SELECT request_hash, booking_id
        FROM idempotency_records
        WHERE user_id = $1
          AND idempotency_key = $2
        FOR UPDATE
        `,
        [userId, idempotencyKey]
      );

      const existing = existingResult.rows[0];

      if (!existing) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "Unable to resolve idempotency key",
        });
      }

      // Same key, different request.
      if (existing.request_hash !== requestHash) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Idempotency key was already used for a different request",
        });
      }

      // Same key and same request: return the original booking.
      if (existing.booking_id !== null) {
        const previousBooking = await client.query(
          `
          SELECT id, user_id, show_id, status, created_at
          FROM bookings
          WHERE id = $1
            AND user_id = $2
          `,
          [existing.booking_id, userId]
        );

        if (previousBooking.rows.length === 0) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            message: "Original booking could not be found",
          });
        }

        await client.query("COMMIT");

        return res.status(200).json({
          message: "Booking already processed",
          booking: previousBooking.rows[0],
        });
      }

      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Request has no completed booking",
      });
    }

    // Lock the requested seats to prevent concurrent double booking.
    const seats = await client.query(
      `
      SELECT seat_id, status
      FROM show_seats
      WHERE show_id = $1
        AND seat_id = ANY($2::bigint[])
      ORDER BY seat_id
      FOR UPDATE
      `,
      [parsedShowId, parsedSeatIds]
    );

    if (
      seats.rows.length !== parsedSeatIds.length ||
      seats.rows.some((seat) => seat.status !== "AVAILABLE")
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "One or more seats are not available",
      });
    }

    // Create the booking using the authenticated user's identity.
    const booking = await client.query(
      `
      INSERT INTO bookings (user_id, show_id, status)
      VALUES ($1, $2, 'CONFIRMED')
      RETURNING id, user_id, show_id, status, created_at
      `,
      [userId, parsedShowId]
    );

    const bookingId = booking.rows[0].id;

    // Associate the idempotency record with the new booking.
    await client.query(
      `
      UPDATE idempotency_records
      SET booking_id = $1
      WHERE user_id = $2
        AND idempotency_key = $3
      `,
      [bookingId, userId, idempotencyKey]
    );

    // Record the seats and prices.
    for (const seatId of parsedSeatIds) {
      await client.query(
        `
        INSERT INTO booking_seats
          (booking_id, show_id, seat_id, price_paid)
        VALUES ($1, $2, $3, $4)
        `,
        [bookingId, parsedShowId, seatId, 250]
      );
    }

    // Mark seats as booked.
    await client.query(
      `
      UPDATE show_seats
      SET status = 'BOOKED'
      WHERE show_id = $1
        AND seat_id = ANY($2::bigint[])
      `,
      [parsedShowId, parsedSeatIds]
    );

    // Booking and idempotency record commit atomically.
    await client.query("COMMIT");

    return res.status(201).json({
      message: "Booking successful",
      booking: booking.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError);
    }

    console.error("Booking failed:", error);

    return res.status(500).json({
      message: "Booking failed",
    });
  } finally {
    client.release();
  }
});

// CANCEL BOOKING
router.delete("/:bookingId", async (req: AuthRequest, res) => {
  const client = await pool.connect();

  try {
    const { bookingId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    await client.query("BEGIN");

    // Only the booking owner can cancel it.
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
        message: "Booking not found",
      });
    }

    if (booking.rows[0].status !== "CONFIRMED") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Booking cannot be cancelled",
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
      // Lock seats before releasing them.
      await client.query(
        `
        SELECT seat_id
        FROM show_seats
        WHERE show_id = $1
          AND seat_id = ANY($2::bigint[])
        ORDER BY seat_id
        FOR UPDATE
        `,
        [showId, seatIds]
      );

      await client.query(
        `
        UPDATE show_seats
        SET status = 'AVAILABLE'
        WHERE show_id = $1
          AND seat_id = ANY($2::bigint[])
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

    return res.json({
      message: "Booking cancelled successfully",
      bookingId,
      releasedSeats: seatIds,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError);
    }

    console.error("Cancellation failed:", error);

    return res.status(500).json({
      message: "Cancellation failed",
    });
  } finally {
    client.release();
  }
});

export default router;
