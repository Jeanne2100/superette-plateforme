const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { hashPassword } = require("../auth");
const { logActivity } = require("../activityLog");

const router = express.Router();

const SELECT_COLUMNS = `id, name, email, role, permissions, is_active AS "isActive", created_at AS "createdAt"`;

// Liste publique minimale (sans authentification) pour peupler le menu déroulant de l'écran de connexion —
// exactement ce que fait déjà le frontend aujourd'hui (populateLoginUsers), qui affiche "Nom — Rôle" avant
// toute connexion. Ne renvoie jamais le mot de passe ni les permissions détaillées.
router.get("/login-list", async (req, res) => {
  const { rows } = await db.query(`SELECT id, name, email, role FROM users WHERE is_active = TRUE ORDER BY name`);
  res.json(rows);
});

router.use(authenticate, requirePage("utilisateurs"), requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} FROM users ORDER BY created_at`);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role, permissions)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${SELECT_COLUMNS}`,
    [name, email.toLowerCase().trim(), hash, role, permissions ? JSON.stringify(permissions) : null]
  );
  await logActivity({ user: req.user, action: "CREATE", entity: "user", entityId: rows[0].id, details: { role } });
  res.status(201).json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const { name, email, role, permissions, isActive, password } = req.body;
  const passwordHash = password ? await hashPassword(password) : null;
  const { rows } = await db.query(
    `UPDATE users SET name=$1, email=$2, role=$3, permissions=$4, is_active=$5,
       password_hash = COALESCE($6, password_hash)
     WHERE id=$7 RETURNING ${SELECT_COLUMNS}`,
    [name, email.toLowerCase().trim(), role, permissions ? JSON.stringify(permissions) : null, isActive !== false, passwordHash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Utilisateur introuvable." });
  await logActivity({ user: req.user, action: "UPDATE", entity: "user", entityId: req.params.id });
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Impossible de désactiver son propre compte." });
  await db.query("UPDATE users SET is_active = FALSE WHERE id = $1", [req.params.id]);
  await logActivity({ user: req.user, action: "DELETE", entity: "user", entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
