// Miroir exact de la logique de permissions du frontend (voir PERMISSION_PAGES / canSeePage / canSeeFinancials
// dans superette-app-fonctionnelle.html) — les deux définitions doivent rester synchronisées si l'une change.
const PERMISSION_PAGES = [
  "dashboard", "caisse", "ventes", "rapports", "produits", "categories",
  "stock", "etiquettes", "clients", "fournisseurs", "utilisateurs", "parametres",
];
const HARD_BLOCKED_PAGES = { CAISSIER: ["rapports", "parametres", "utilisateurs"] };
const DEFAULT_PERMISSIONS_BY_ROLE = {
  ADMIN: PERMISSION_PAGES,
  GERANT: ["dashboard", "caisse", "ventes", "produits", "categories", "stock", "etiquettes", "clients", "fournisseurs"],
  CAISSIER: ["caisse", "clients"],
};

function canSeePage(user, page) {
  if (user.role === "ADMIN") return true;
  const blocked = HARD_BLOCKED_PAGES[user.role] || [];
  if (blocked.includes(page)) return false;
  const perms = user.permissions || DEFAULT_PERMISSIONS_BY_ROLE[user.role] || [];
  return perms.includes(page);
}
function canSeeFinancials(user) {
  if (user.role === "ADMIN") return true;
  if (user.role === "CAISSIER") return false;
  const perms = user.permissions || [];
  return perms.includes("financials");
}

// Middleware Express : bloque une route si l'utilisateur n'a pas accès à la page/module correspondant.
// Deuxième ligne de défense CÔTÉ SERVEUR — le frontend masque déjà le menu, mais un appel direct à
// l'API (URL/outil externe) doit être refusé de la même façon, exactement comme demandé.
function requirePage(page) {
  return (req, res, next) => {
    if (!canSeePage(req.user, page)) {
      return res.status(403).json({ error: `Accès refusé au module "${page}".` });
    }
    next();
  };
}
function requireFinancials(req, res, next) {
  if (!canSeeFinancials(req.user)) return res.status(403).json({ error: "Accès refusé aux données financières." });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Rôle insuffisant pour cette action." });
    next();
  };
}

module.exports = { PERMISSION_PAGES, DEFAULT_PERMISSIONS_BY_ROLE, canSeePage, canSeeFinancials, requirePage, requireFinancials, requireRole };
