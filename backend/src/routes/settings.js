const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();

const SELECT_COLUMNS = `
  name, owner_name AS "ownerName", slogan, phone, whatsapp, address, city, country, email,
  website, rccm, nif, currency, timezone, lat, lng, logo, printer
`;

// Lecture publique (sans authentification) : l'écran de connexion affiche le logo/nom de la supérette
// avant même que quiconque soit connecté — ces informations ne sont pas sensibles.
router.get("/", async (req, res) => {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} FROM company_settings WHERE id = 1`);
  res.json(rows[0]);
});

router.put("/", authenticate, requireRole("ADMIN"), async (req, res) => {
  const c = req.body;
  const { rows } = await db.query(
    `UPDATE company_settings SET name=$1, owner_name=$2, slogan=$3, phone=$4, whatsapp=$5, address=$6, city=$7,
       country=$8, email=$9, website=$10, rccm=$11, nif=$12, currency=$13, timezone=$14, lat=$15, lng=$16,
       logo=$17, printer=$18, updated_at=now() WHERE id = 1 RETURNING ${SELECT_COLUMNS}`,
    [c.name, c.ownerName, c.slogan, c.phone, c.whatsapp, c.address, c.city, c.country, c.email, c.website,
      c.rccm, c.nif, c.currency, c.timezone, c.lat, c.lng, c.logo, JSON.stringify(c.printer || {})]
  );
  await logActivity({ user: req.user, action: "UPDATE", entity: "settings", entityId: "1" });
  res.json(rows[0]);
});

module.exports = router;
