const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();
router.use(authenticate); // lecture ouverte à tout utilisateur connecté (voir note dans products.js)

router.get("/", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM categories ORDER BY name");
  res.json(rows);
});
router.post("/", requirePage("categories"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await db.query("INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *", [name, description || null]);
  await logActivity({ user: req.user, action: "CREATE", entity: "category", entityId: rows[0].id, details: { name } });
  res.status(201).json(rows[0]);
});
router.put("/:id", requirePage("categories"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await db.query("UPDATE categories SET name=$1, description=$2 WHERE id=$3 RETURNING *", [name, description || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Catégorie introuvable." });
  await logActivity({ user: req.user, action: "UPDATE", entity: "category", entityId: req.params.id });
  res.json(rows[0]);
});
router.delete("/:id", requirePage("categories"), requireRole("ADMIN"), async (req, res) => {
  await db.query("DELETE FROM categories WHERE id = $1", [req.params.id]);
  await logActivity({ user: req.user, action: "DELETE", entity: "category", entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
