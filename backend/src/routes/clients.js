const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();
router.use(authenticate); // lecture ouverte à tout utilisateur connecté (voir note dans products.js)

router.get("/", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM clients ORDER BY name");
  res.json(rows);
});
router.post("/", requirePage("clients"), async (req, res) => {
  const { name, phone, address, notes, debt } = req.body;
  const { rows } = await db.query("INSERT INTO clients (name, phone, address, notes, debt) VALUES ($1,$2,$3,$4,$5) RETURNING *", [name, phone || null, address || null, notes || null, debt || 0]);
  await logActivity({ user: req.user, action: "CREATE", entity: "client", entityId: rows[0].id, details: { name } });
  res.status(201).json(rows[0]);
});
router.put("/:id", requirePage("clients"), async (req, res) => {
  const { name, phone, address, notes, debt } = req.body;
  const { rows } = await db.query("UPDATE clients SET name=$1, phone=$2, address=$3, notes=$4, debt=$5 WHERE id=$6 RETURNING *", [name, phone || null, address || null, notes || null, debt || 0, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Client introuvable." });
  await logActivity({ user: req.user, action: "UPDATE", entity: "client", entityId: req.params.id });
  res.json(rows[0]);
});
router.delete("/:id", requirePage("clients"), requireRole("ADMIN"), async (req, res) => {
  await db.query("DELETE FROM clients WHERE id = $1", [req.params.id]);
  await logActivity({ user: req.user, action: "DELETE", entity: "client", entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
