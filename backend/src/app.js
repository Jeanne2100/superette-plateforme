require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(",") }));
app.use(express.json({ limit: "5mb" })); // le logo/les images produit voyagent en Base64 dans le JSON

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/categories", require("./routes/categories"));
app.use("/api/suppliers", require("./routes/suppliers"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/stock-movements", require("./routes/stockMovements"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/logs", require("./routes/logs"));

app.use((req, res) => res.status(404).json({ error: "Route introuvable." }));

// Gestionnaire d'erreurs centralisé — toute erreur non interceptée renvoie du JSON propre,
// jamais une page HTML de stack trace (sécurité + cohérence avec le frontend).
app.use((err, req, res, next) => {
  console.error("[app] Erreur non gérée :", err);
  res.status(err.status || 500).json({ error: err.message || "Erreur interne du serveur." });
});

module.exports = app;
