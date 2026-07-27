const db = require("./db");

// Journal d'activité : appelé explicitement par les routes qui créent/modifient/suppriment des données,
// ou qui gèrent des paiements — jamais pour de simples lectures (GET), pour rester lisible et utile.
async function logActivity({ user, action, entity, entityId, details }) {
  try {
    await db.query(
      `INSERT INTO activity_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user?.id || null, user?.name || null, action, entity, entityId || null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    // Un échec de journalisation ne doit jamais faire échouer l'opération métier elle-même.
    console.error("[activityLog] Échec d'écriture du journal :", err);
  }
}

module.exports = { logActivity };
