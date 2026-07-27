const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();

const SELECT_COLUMNS = `
  id, name, brand, category_id AS "categoryId", purchase_price AS "purchasePrice",
  selling_price AS "sellingPrice", quantity, unit, low_stock_threshold AS "lowStockThreshold",
  expiration_date AS "expirationDate", image_url AS "imageUrl", qr_code AS "qrCode",
  barcode, is_active AS "isActive", created_at AS "createdAt"
`;

router.use(authenticate); // lecture : accessible à tout utilisateur connecté — la Caisse a besoin des
// produits même sans la permission de page "produits" (exactement comme l'ancien modèle localStorage,
// où toutes les données étaient de toute façon en mémoire ; la vraie protection est sur les pages/menus
// et sur les mutations ci-dessous, jamais sur la simple lecture du catalogue).

router.get("/", async (req, res) => {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} FROM products ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/", requirePage("produits"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const p = req.body;
  const { rows } = await db.query(
    `INSERT INTO products (name, brand, category_id, purchase_price, selling_price, quantity, unit,
       low_stock_threshold, expiration_date, image_url, qr_code, barcode, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${SELECT_COLUMNS}`,
    [p.name, p.brand, p.categoryId, p.purchasePrice, p.sellingPrice, p.quantity, p.unit,
      p.lowStockThreshold, p.expirationDate || null, p.imageUrl || null, p.qrCode, p.barcode || null, p.isActive !== false]
  );
  if (Number(p.quantity) > 0) {
    await db.query("INSERT INTO stock_movements (product_id, type, quantity, user_id) VALUES ($1,'ACHAT',$2,$3)", [rows[0].id, p.quantity, req.user.id]);
  }
  await logActivity({ user: req.user, action: "CREATE", entity: "product", entityId: rows[0].id, details: { name: p.name } });
  res.status(201).json(rows[0]);
});

router.put("/:id", requirePage("produits"), requireRole("ADMIN", "GERANT"), async (req, res) => {
  const p = req.body;
  const { rows: beforeRows } = await db.query("SELECT quantity FROM products WHERE id = $1", [req.params.id]);
  if (!beforeRows[0]) return res.status(404).json({ error: "Produit introuvable." });
  const previousQuantity = Number(beforeRows[0].quantity);

  const { rows } = await db.query(
    `UPDATE products SET name=$1, brand=$2, category_id=$3, purchase_price=$4, selling_price=$5,
       quantity=$6, unit=$7, low_stock_threshold=$8, expiration_date=$9, image_url=$10,
       barcode=$11, is_active=$12 WHERE id=$13 RETURNING ${SELECT_COLUMNS}`,
    [p.name, p.brand, p.categoryId, p.purchasePrice, p.sellingPrice, p.quantity, p.unit,
      p.lowStockThreshold, p.expirationDate || null, p.imageUrl || null, p.barcode || null, p.isActive !== false, req.params.id]
  );
  const diff = Number(p.quantity) - previousQuantity;
  if (diff !== 0) {
    await db.query("INSERT INTO stock_movements (product_id, type, quantity, user_id) VALUES ($1,'CORRECTION',$2,$3)", [req.params.id, diff, req.user.id]);
  }
  await logActivity({ user: req.user, action: "UPDATE", entity: "product", entityId: req.params.id });
  res.json(rows[0]);
});

router.delete("/:id", requirePage("produits"), requireRole("ADMIN"), async (req, res) => {
  await db.query("UPDATE products SET is_active = FALSE WHERE id = $1", [req.params.id]);
  await logActivity({ user: req.user, action: "DELETE", entity: "product", entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
