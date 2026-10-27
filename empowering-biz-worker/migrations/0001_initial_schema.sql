-- Empowering Biz initial D1 schema.
-- Currency amounts are stored as integer minor units (paise) to avoid floating-point rounding.
-- Apply only to a NEW, dedicated Empowering Biz D1 database.

CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  price_paise INTEGER,
  price_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (price_type IN ('fixed', 'starting_from', 'flexible')),
  currency TEXT NOT NULL DEFAULT 'INR',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  merchant_product_id TEXT,
  merchant_price_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  purchase_type TEXT NOT NULL DEFAULT 'cart'
    CHECK (purchase_type IN ('cart', 'month', 'session', 'callback')),
  CHECK (price_paise IS NULL OR price_paise > 0)
);

CREATE INDEX services_active_idx ON services(is_active);
CREATE INDEX services_price_type_idx ON services(price_type);
CREATE INDEX services_purchase_type_idx ON services(purchase_type);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX orders_status_created_idx ON orders(status, created_at);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 100),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(service_id)
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled')),
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0, 1)),
  error_code TEXT,
  error_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);
CREATE INDEX payment_transactions_order_idx ON payment_transactions(order_id);
CREATE INDEX payment_transactions_status_idx ON payment_transactions(status);

CREATE TABLE webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT
);
CREATE INDEX webhook_events_status_idx ON webhook_events(status, received_at);

CREATE TABLE payment_email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('admin', 'customer')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_email_id TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  UNIQUE (order_id, recipient_type)
);
CREATE INDEX payment_email_retry_idx ON payment_email_notifications(status, created_at);

CREATE TABLE contact_enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  service TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed')),
  resend_email_id TEXT,
  notification_error TEXT,
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notified_at TEXT
);
CREATE INDEX contact_enquiries_status_created_idx ON contact_enquiries(status, created_at);
CREATE INDEX contact_enquiries_notification_idx ON contact_enquiries(notification_status, created_at);
