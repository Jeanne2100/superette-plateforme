// Exécute ce script UNE SEULE FOIS après `npm install`, pour créer le tout premier compte administrateur
// avec un vrai hash bcrypt (calculé ici, dans ton environnement réel — jamais fabriqué à la main).
// Usage : node scripts/create-admin.js "Administrateur" admin@superette.local "un-mot-de-passe-solide"
require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("../src/db");

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error("Usage : node scripts/create-admin.js \"Nom\" email@exemple.com motdepasse");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Le mot de passe doit contenir au moins 8 caractères.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [name, email.toLowerCase().trim(), hash]
  );
  console.log(`✔ Compte administrateur prêt : ${rows[0].email} (id ${rows[0].id})`);
  process.exit(0);
}
main().catch((err) => { console.error("Échec :", err); process.exit(1); });
