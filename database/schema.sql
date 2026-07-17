CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin') NOT NULL DEFAULT 'admin',
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(160) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'scripts',
  description TEXT NOT NULL,
  image_url LONGTEXT NULL,
  old_price DECIMAL(10, 2) NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  badge VARCHAR(80) NULL,
  purchase_options LONGTEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  selected_option VARCHAR(220) NULL,
  status ENUM('pendiente', 'pagado', 'cancelado', 'entregado') NOT NULL DEFAULT 'pendiente',
  source VARCHAR(80) NOT NULL DEFAULT 'pagina',
  session_id VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_sales_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('page_view', 'whatsapp_click', 'buy_click') NOT NULL,
  source VARCHAR(120) NULL,
  session_id VARCHAR(120) NULL,
  product_id INT NULL,
  metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_ip VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS customer_verification_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  email VARCHAR(180) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  purpose ENUM('email_verification', 'password_reset') NOT NULL DEFAULT 'email_verification',
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_codes_customer (customer_id),
  INDEX idx_customer_codes_email (email),
  CONSTRAINT fk_customer_codes_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  type ENUM('topup', 'purchase', 'reward', 'admin_adjustment', 'refund') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  reference_type VARCHAR(60) NULL,
  reference_id INT NULL,
  description VARCHAR(255) NOT NULL,
  created_by_admin_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wallet_customer (customer_id, id),
  CONSTRAINT fk_wallet_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_admin FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS topup_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  method ENUM('transferencia', 'oxxo', 'binance') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  proof_image LONGTEXT NULL,
  proof_note TEXT NULL,
  admin_note TEXT NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  INDEX idx_topup_customer (customer_id, id),
  INDEX idx_topup_status (status, id),
  CONSTRAINT fk_topup_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_topup_admin FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  selected_option VARCHAR(220) NULL,
  price DECIMAL(10, 2) NOT NULL,
  reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 15.00,
  status ENUM('paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'paid',
  receipt_code VARCHAR(40) NOT NULL UNIQUE,
  pin_code VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  INDEX idx_customer_orders_customer (customer_id, id),
  CONSTRAINT fk_customer_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_orders_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_email VARCHAR(180) NOT NULL,
  subject VARCHAR(220) NOT NULL,
  body LONGTEXT NOT NULL,
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  error_text TEXT NULL,
  sent_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('whatsappGroup', 'https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3'),
  ('whatsappNumber', '5216863387186'),
  ('storeName', 'GARCITA STORE')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
