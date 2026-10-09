
import cron from "node-cron";
import { pool } from "../db.js";

export const startIdempotencyCleanup = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const result = await pool.query(
        "SELECT cleanup_expired_idempotency_records() AS deleted_count"
      );

      console.log(
        `Idempotency cleanup completed. Deleted records: ${result.rows[0].deleted_count}`
      );
    } catch (error) {
      console.error("Idempotency cleanup failed:", error);
    }
  });

  console.log("Idempotency cleanup scheduled hourly.");
};
