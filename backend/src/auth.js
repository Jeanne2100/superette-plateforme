const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET manquant dans .env — génère une valeur longue et aléatoire (ex: `openssl rand -hex 32`).");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // lève une erreur si invalide/expiré
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
