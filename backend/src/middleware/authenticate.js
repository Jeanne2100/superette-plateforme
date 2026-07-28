const { verifyToken } = require("../auth");
const db = require("../db");

module.exports = async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise." });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée, reconnecte-toi." });
  }

  const { rows } = await db.query(
    `SELECT id, name, email, role, permissions, is_active AS "isActive" FROM users WHERE id = $1`,
    [payload.sub]
  );
  const user = rows[0];
if (!user || !user.isActive)
  return res.status(401).json({
    error: "Compte introuvable ou désactivé."
  });

  req.user = user;
  next();
};
