-- ============================================================
-- Supérette ERP/POS — schéma PostgreSQL initial
-- Choix PostgreSQL plutôt que MySQL/MariaDB : contraintes de clés étrangères et
-- types JSONB natifs (permissions utilisateur, configuration imprimante) plus
-- robustes pour un modèle relationnel avec autant de relations croisées
-- (ventes -> lignes -> produits -> paiements -> mouvements de stock).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- pour gen_random_uuid()

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'GERANT', 'CAISSIER')),
  -- Liste plate des pages autorisées, ex: ["dashboard","caisse","clients"]. Pour un GERANT, peut aussi
  -- contenir l'entrée spéciale "financials" (voir permissions.js) — exactement le même format que le
  -- frontend (permissionCheckboxesHtml / canSeeFinancials), aucune colonne séparée nécessaire.
  permissions JSONB DEFAULT NULL, -- NULL = valeurs par défaut du rôle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  debt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  purchase_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unité',
  low_stock_threshold NUMERIC(14, 2) NOT NULL DEFAULT 5,
  expiration_date DATE,
  image_url TEXT, -- image compressée en Base64 (voir note frontend)
  qr_code TEXT UNIQUE NOT NULL,
  barcode TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_qr_code ON products(qr_code);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL, -- copie figée (comme product_name sur sale_items) : reste correcte même si le compte est désactivé/renommé plus tard
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  subtotal NUMERIC(14, 2) NOT NULL,
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('ESPECES', 'MOBILE_MONEY', 'CARTE')),
  status TEXT NOT NULL DEFAULT 'VALIDEE',
  is_credit BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_client ON sales(client_id);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL, -- copie figée au moment de la vente (le produit peut changer/être supprimé après)
  unit_price NUMERIC(14, 2) NOT NULL,
  quantity NUMERIC(14, 2) NOT NULL,
  subtotal NUMERIC(14, 2) NOT NULL
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity NUMERIC(14, 2) NOT NULL, -- négatif pour une sortie (vente), positif pour une entrée
  reason TEXT,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);

-- Une seule ligne "singleton" pour les paramètres de la supérette
CREATE TABLE company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Supérette',
  owner_name TEXT,
  slogan TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  email TEXT,
  website TEXT,
  rccm TEXT,
  nif TEXT,
  currency TEXT NOT NULL DEFAULT 'GNF',
  timezone TEXT NOT NULL DEFAULT 'Africa/Conakry',
  lat TEXT,
  lng TEXT,
  logo TEXT, -- Base64 compressé (voir note frontend sur le redimensionnement)
  printer JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_settings (id) VALUES (1);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT, -- copie figée (reste lisible même si le compte est supprimé plus tard)
  action TEXT NOT NULL,      -- ex: 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PAYMENT'
  entity TEXT NOT NULL,      -- ex: 'product', 'sale', 'user', 'settings'
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity, entity_id);

-- Le compte administrateur initial n'est PAS inséré ici : un mot de passe haché doit être généré par
-- un vrai calcul bcrypt (voir scripts/create-admin.js, à exécuter une fois après `npm install`).
-- Insérer ici un hash "à la main" serait risqué : sans bcrypt réellement exécuté, impossible de garantir
-- qu'il correspond au mot de passe voulu, ce qui bloquerait la toute première connexion.
