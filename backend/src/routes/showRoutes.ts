import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        shows.id,
        events.name AS event_name,
        venues.name AS venue_name,
        shows.start_time
      FROM shows
      JOIN events
        ON events.id = shows.event_id
      JOIN venues
        ON venues.id = shows.venue_id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch shows"
    });
  }
});

export default router;