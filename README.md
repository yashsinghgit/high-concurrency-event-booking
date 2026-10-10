# High-Concurrency Event Booking Platform

A backend-focused event booking system built to explore concurrency control, transactional consistency, and reliable booking APIs.

## Tech Stack

- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL
- **API Testing:** Postman
- **Security and Reliability:** JWT authentication, idempotency keys, API rate limiting

## Key Features

- Relational database design for users, events, venues, seats, shows, and bookings.
- Transactional booking and cancellation workflows.
- PostgreSQL row-level locking using `SELECT ... FOR UPDATE` to protect seats against competing booking requests.
- Idempotency-key handling to prevent duplicate bookings on request retries.
- JWT-based authentication and protected booking endpoints.
- API rate limiting for general traffic, login, registration, and booking requests.
- Scheduled cleanup of expired idempotency records.

## Concurrency Testing

A concurrent booking test sent **500 requests for the same seat**.

| Result | Count |
|---|---:|
| Successful bookings | 1 |
| Rejected requests | 499 |
| Total requests | 500 |

This test demonstrates that only one request successfully booked the contested seat under the tested conditions.

## Database Design

The PostgreSQL schema uses primary keys, foreign keys, relational constraints, and transactions to maintain booking consistency.

## Running Locally

1. Install Node.js and PostgreSQL.
2. Configure the database connection and JWT secret in your local `.env` file.
3. Install dependencies with `npm install` inside the `backend` directory.
4. Start the development server with `npx tsx watch src/server.ts`.

Configure your database and environment variables before starting the server. Never commit `.env` or credentials.

## Project Status

In progress. Integration testing, production hardening, and further reliability improvements remain ongoing.
