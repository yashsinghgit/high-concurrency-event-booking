import express from "express";
import {pool} from "./db";
import eventRoutes from "./routes/eventRoutes";
import showRoutes from "./routes/showRoutes";
import seatRoutes from "./routes/seatRoutes";
import bookingRoutes from "./routes/bookingRoutes";


const app = express();

app.use(express.json());
app.use("/api/events", eventRoutes); 
app.use("/api/shows", showRoutes); 
app.use("/api/shows", seatRoutes);
app.use("/api/bookings", bookingRoutes);


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
