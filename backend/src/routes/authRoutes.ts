import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, phoneNo, password } = req.body;

    if (!password || (!email && !phoneNo)) {
      return res.status(400).json({
        message: "Email or phone number and password are required"
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (email, phone_no, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, phone_no
      `,
      [email || null, phoneNo || null, passwordHash]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Registration failed"
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const result = await pool.query(
      `
      SELECT id, email, phone_no, password_hash
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      {
        userId: user.id
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: "1h"
      }
    );

    res.json({
      message: "Login successful",
      token
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed"
    });
  }
});

export default router;1