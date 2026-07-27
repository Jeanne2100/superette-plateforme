const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requirePage, canSeeFinancials } = require("../permissions");
const { logActivity } = require("../activityLog");

const router = express.Router();
router.use(authenticate);

const SALE_COLUMNS = `
  id, code, user_id AS "userId", user_name AS "userName", client_id AS "clientId",
  subtotal, discount, tax_rate AS "taxRate", tax, total, payment_method AS "paymentMethod",
  status, is_credit AS "isCredit", due_date AS "dueDate", notes, created_at AS "createdAt"
`;
const ITEM_COLUMNS = `id, sale_id AS "saleId", product_id AS "productId", product_name AS "productName", unit_price AS "unitPrice", quantity, subtotal`;
const PAYMENT_COLUMNS = `id, sale_id AS "saleId", amount, user_id AS "userId", user_name AS "userName", paid_at AS "date"`;

router.get("/", requirePage("ventes"), async (req, res) => {
  const { rows: sales } = await db.query(`SELECT ${SALE_COLUMNS} FROM sales ORDER BY created_at DESC LIMIT 500`);
  const ids = sales.map(s => s.id);
  const { rows: items } = await db.query(`SELECT ${ITEM_COLUMNS} FROM sale_items WHERE sale_id = ANY($1)`, [ids]);
  const { rows: payments } = await db.query(`SELECT ${PAYMENT_COLUMNS} FROM sale_payments WHERE sale_id = ANY($1)`, [ids]);
  res.json(sales.map(s => ({
    ...s,
    items: items.filter(i => i.saleId === s.id).map(({ saleId, ...rest }) => rest),
    payments: payments.filter(p => p.saleId === s.id).map(({ saleId, ...rest }) => rest),
  })));
});

// Création d'une vente : transaction complète (tout ou rien). Si le stock est insuffisant ou qu'une
// étape échoue, AUCUNE modification n'est appliquée (protection contre la corruption des données).
router.post("/", requirePage("caisse"), async (req, res) => {
  const { items, clientId, discount = 0, taxRate = 0, paymentMethod, isCredit, amountPaid, dueDate, notes } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Le panier est vide." });

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    let subtotal = 0;
    const lockedProducts = {};
    for (const line of items) {
      const { rows } = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [line.productId]);
      const product = rows[0];
      if (!product || !product.is_active) throw Object.assign(new Error(`Produit introuvable (${line.productId}).`), { status: 404 });
      if (Number(product.quantity) < line.quantity) throw Object.assign(new Error(`Stock insuffisant pour "${product.name}".`), { status: 409 });
      lockedProducts[line.productId] = product;
      subtotal += Number(product.selling_price) * line.quantity;
    }

    const taxedBase = Math.max(subtotal - discount, 0);
    const tax = (taxedBase * taxRate) / 100;
    const total = taxedBase + tax;

    if (isCredit && !clientId) throw Object.assign(new Error("Client obligatoire pour une vente à crédit."), { status: 400 });
    const paidNow = isCredit ? Math.max(0, Number(amountPaid) || 0) : total;
    if (paidNow > total) throw Object.assign(new Error("Le montant payé dépasse le total."), { status: 400 });

    const { rows: countRows } = await client.query("SELECT COUNT(*)::int AS n FROM sales");
    const code = `VNT-${String(countRows[0].n + 1).padStart(6, "0")}`;

    const { rows: saleRows } = await client.query(
      `INSERT INTO sales (code, user_id, user_name, client_id, subtotal, discount, tax_rate, tax, total, payment_method, is_credit, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${SALE_COLUMNS}`,
      [code, req.user.id, req.user.name, clientId || null, subtotal, discount, taxRate, tax, total, paymentMethod, !!isCredit, dueDate || null, notes || null]
    );
    const sale = saleRows[0];
    const savedItems = [];

    for (const line of items) {
      const product = lockedProducts[line.productId];
      const lineSubtotal = Number(product.selling_price) * line.quantity;
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, subtotal) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sale.id, product.id, product.name, product.selling_price, line.quantity, lineSubtotal]
      );
      savedItems.push({ productId: product.id, productName: product.name, unitPrice: Number(product.selling_price), quantity: line.quantity, subtotal: lineSubtotal });
      await client.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2", [line.quantity, product.id]);
      await client.query(`INSERT INTO stock_movements (product_id, type, quantity, user_id) VALUES ($1,'VENTE',$2,$3)`, [product.id, -line.quantity, req.user.id]);
    }

    let savedPayments = [];
    if (isCredit && paidNow > 0) {
      const { rows: payRows } = await client.query(
        `INSERT INTO sale_payments (sale_id, amount, user_id, user_name) VALUES ($1,$2,$3,$4) RETURNING ${PAYMENT_COLUMNS}`,
        [sale.id, paidNow, req.user.id, req.user.name]
      );
      savedPayments = payRows.map(({ saleId, ...rest }) => rest);
    }
    if (isCredit && total - paidNow > 0 && clientId) {
      await client.query("UPDATE clients SET debt = debt + $1 WHERE id = $2", [total - paidNow, clientId]);
    }

    await client.query("COMMIT");
    await logActivity({ user: req.user, action: "CREATE", entity: "sale", entityId: sale.id, details: { code, total, isCredit } });
    res.status(201).json({ ...sale, items: savedItems, payments: savedPayments });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(err.status || 500).json({ error: err.message || "Échec de la vente." });
  } finally {
    client.release();
  }
});

// Paiement d'une vente à crédit — également transactionnel (paiement + créance client mis à jour ensemble).
router.post("/:id/payments", requirePage("caisse"), async (req, res) => {
  const { amount } = req.body;
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [req.params.id]);
    const sale = rows[0];
    if (!sale) throw Object.assign(new Error("Vente introuvable."), { status: 404 });

    const { rows: paidRows } = await client.query("SELECT COALESCE(SUM(amount),0) AS paid FROM sale_payments WHERE sale_id = $1", [sale.id]);
    const remaining = Number(sale.total) - Number(paidRows[0].paid);
    if (!amount || amount <= 0 || amount > remaining) throw Object.assign(new Error("Montant invalide (dépasse le solde restant)."), { status: 400 });

    const { rows: payRows } = await client.query(
      `INSERT INTO sale_payments (sale_id, amount, user_id, user_name) VALUES ($1,$2,$3,$4) RETURNING ${PAYMENT_COLUMNS}`,
      [sale.id, amount, req.user.id, req.user.name]
    );
    if (sale.client_id) await client.query("UPDATE clients SET debt = GREATEST(0, debt - $1) WHERE id = $2", [amount, sale.client_id]);

    await client.query("COMMIT");
    await logActivity({ user: req.user, action: "PAYMENT", entity: "sale", entityId: sale.id, details: { amount } });
    const { saleId, ...payment } = payRows[0];
    res.status(201).json(payment);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(err.status || 500).json({ error: err.message || "Échec de l'enregistrement du paiement." });
  } finally {
    client.release();
  }
});

// Agrégats pour la page Rapports — les champs de bénéfice/marge exigent la permission financière.
router.get("/reports/summary", requirePage("rapports"), async (req, res) => {
  const { start, end } = req.query;
  const showFinancials = canSeeFinancials(req.user);

  const { rows } = await db.query(
    `SELECT s.id, s.total, s.created_at AS "createdAt",
            COALESCE(json_agg(json_build_object('quantity', si.quantity)) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
     FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.created_at BETWEEN $1 AND $2 AND s.status = 'VALIDEE'
     GROUP BY s.id`,
    [start, end]
  );

  const revenue = rows.reduce((sum, s) => sum + Number(s.total), 0);
  const salesCount = rows.length;
  const productsSold = rows.reduce((sum, s) => sum + s.items.reduce((a, i) => a + Number(i.quantity), 0), 0);
  const payload = { revenue, salesCount, productsSold, avgBasket: salesCount ? revenue / salesCount : 0 };

  if (showFinancials) {
    const { rows: costRows } = await db.query(
      `SELECT COALESCE(SUM(si.subtotal - (p.purchase_price * si.quantity)), 0) AS margin
       FROM sale_items si JOIN products p ON p.id = si.product_id
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at BETWEEN $1 AND $2 AND s.status = 'VALIDEE'`,
      [start, end]
    );
    payload.grossMargin = Number(costRows[0].margin);
  }
  res.json(payload);
});

module.exports = router;
