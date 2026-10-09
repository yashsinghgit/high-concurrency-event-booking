import express from "express";
import {pool} from "./db";
import eventRoutes from "./routes/eventRoutes";
import showRoutes from "./routes/showRoutes";
import seatRoutes from "./routes/seatRoutes";
import bookingRoutes from "./routes/bookingRoutes";
import authRoutes from "./routes/authRoutes";
import { authenticate } from "./middleware/authMiddleware";
import { startIdempotencyCleanup } from "./jobs/idempotencyCleanup";

const app = express();

app.use(express.json());
app.use("/api/events", eventRoutes); 
app.use("/api/shows", showRoutes); 
app.use("/api/seats", seatRoutes);
app.use("/api/bookings", authenticate, bookingRoutes);
app.use("/api/auth", authRoutes);


app.get("/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: result.rows[0],
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: "Failed to connect to database"
        });
    }
});
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
startIdempotencyCleanup();