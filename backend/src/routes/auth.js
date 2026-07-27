const express = require("express");
const db = require("../db");
const { verifyPassword, hashPassword, signToken } = require("../auth");
const authenticate = require("../middleware/authenticate");
const { logActivity } = require("../activityLog");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "E-mail et mot de passe requis." });

  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: "Identifiants invalides." });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Identifiants invalides." });

  const token = signToken(user);
  await logActivity({ user, action: "LOGIN", entity: "user", entityId: user.id });
  const safeUser = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    permissions: user.permissions, isActive: user.is_active, createdAt: user.created_at,
  };
  res.json({ token, user: safeUser });
});

router.get("/me", authenticate, (req, res) => res.json({ user: req.user }));

router.post("/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });

  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  const ok = await verifyPassword(currentPassword || "", rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: "Mot de passe actuel incorrect." });

  const newHash = await hashPassword(newPassword);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user.id]);
  await logActivity({ user: req.user, action: "UPDATE", entity: "user", entityId: req.user.id, details: { field: "password" } });
  res.json({ ok: true });
});

module.exports = router;
