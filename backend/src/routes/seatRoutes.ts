import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/:showId/seats", async (req, res) => {
  try {
    const { showId } = req.params;

    const result = await pool.query(
      `
      SELECT
        seats.id AS seat_id,
        seats.seat_row,
        seats.seat_number,
        show_seats.status
      FROM show_seats
      JOIN seats
        ON seats.id = show_seats.seat_id
      WHERE show_seats.show_id = $1
      ORDER BY seats.seat_row, seats.seat_number
      `,
      [showId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch seats"
    });
  }
});

export default router;