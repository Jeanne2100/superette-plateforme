const express = require("express");
const db = require("../db");
const authenticate = require("../middleware/authenticate");
const { requireRole } = require("../permissions");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const { entity, limit = 200 } = req.query;
  const { rows } = entity
    ? await db.query("SELECT * FROM activity_logs WHERE entity = $1 ORDER BY created_at DESC LIMIT $2", [entity, limit])
    : await db.query("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1", [limit]);
  res.json(rows);
});

module.exports = router;
