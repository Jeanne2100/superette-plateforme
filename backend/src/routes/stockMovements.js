const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, requireRole } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();
router.use(authenticate, requirePage("stock"));

const SELECT_COLUMNS = `id, product_id AS "productId", type, quantity, reason, user_id AS "userId", created_at AS "createdAt"`;

router.get("/", async (req, res) => {
  const { productId } = req.query;
  const { rows } = productId
    ? await db.query(`SELECT ${SELECT_COLUMNS} FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC`, [productId])
    : await db.query(`SELECT ${SELECT_COLUMNS} FROM stock_movements ORDER BY created_at DESC LIMIT 500`);
  res.json(rows);
});

// Ajustement manuel de stock (réassort, perte, correction d'inventaire...) — transaction complète.
router.post("/", requireRole("ADMIN", "GERANT"), async (req, res) => {
  const { productId, type, quantity, reason } = req.body;
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const { rows: prodRows } = await client.query("SELECT quantity FROM products WHERE id = $1 FOR UPDATE", [productId]);
    if (!prodRows[0]) throw Object.assign(new Error("Produit introuvable."), { status: 404 });
    if (Number(prodRows[0].quantity) + Number(quantity) < 0) throw Object.assign(new Error("Le stock ne peut pas devenir négatif."), { status: 400 });

    await client.query("UPDATE products SET quantity = quantity + $1 WHERE id = $2", [quantity, productId]);
    const { rows } = await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, reason, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING ${SELECT_COLUMNS}`,
      [productId, type || "AJUSTEMENT", quantity, reason || null, req.user.id]
    );
    await client.query("COMMIT");
    await logActivity({ user: req.user, action: "UPDATE", entity: "stock", entityId: productId, details: { quantity, type, reason } });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(err.status || 500).json({ error: err.message || "Échec de l'ajustement de stock." });
  } finally {
    client.release();
  }
});

module.exports = router;
