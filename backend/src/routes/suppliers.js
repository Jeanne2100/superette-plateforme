const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();
router.use(authenticate); // lecture ouverte à tout utilisateur connecté (voir note dans products.js)

router.get("/", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM suppliers ORDER BY name");
  res.json(rows);
});
router.post("/", requirePage("fournisseurs"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const { name, phone, address, notes } = req.body;
  const { rows } = await db.query("INSERT INTO suppliers (name, phone, address, notes) VALUES ($1,$2,$3,$4) RETURNING *", [name, phone || null, address || null, notes || null]);
  await logActivity({ user: req.user, action: "CREATE", entity: "supplier", entityId: rows[0].id, details: { name } });
  res.status(201).json(rows[0]);
});
router.put("/:id", requirePage("fournisseurs"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const { name, phone, address, notes } = req.body;
  const { rows } = await db.query("UPDATE suppliers SET name=$1, phone=$2, address=$3, notes=$4 WHERE id=$5 RETURNING *", [name, phone || null, address || null, notes || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Fournisseur introuvable." });
  await logActivity({ user: req.user, action: "UPDATE", entity: "supplier", entityId: req.params.id });
  res.json(rows[0]);
});
router.delete("/:id", requirePage("fournisseurs"), requireRole("ADMIN"), async (req, res) => {
  await db.query("DELETE FROM suppliers WHERE id = $1", [req.params.id]);
  await logActivity({ user: req.user, action: "DELETE", entity: "supplier", entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
