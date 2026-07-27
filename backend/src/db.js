// Pool de connexions PostgreSQL partagé par toute l'application.
// DATABASE_URL doit inclure ?sslmode=require pour la plupart des hébergeurs gérés (Supabase, Neon, Render).
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[db] Erreur inattendue sur une connexion inactive du pool :", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(), // pour les transactions (voir routes/sales.js)
  pool,
};
