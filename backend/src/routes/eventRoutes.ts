import {Router} from 'express';
import {pool} from '../db.js';

const router = Router();

router.get("/", async(req, res) => {
    try {
        const result = await pool.query("SELECT * FROM events");
        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch events"
        });
    }
});

export default router;