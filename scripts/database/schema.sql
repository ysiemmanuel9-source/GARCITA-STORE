CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin', 'helper', 'client') NOT NULL DEFAULT 'client',
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160) NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact VARCHAR(80) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  image LONGTEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS product_durations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  label VARCHAR(80) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_duration_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  buyer_name VARCHAR(160) NOT NULL,
  buyer_contact VARCHAR(80) NOT NULL,
  payment_method VARCHAR(120) NOT NULL,
  note TEXT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status ENUM('pendiente', 'pagado', 'cancelado', 'entregado') NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(160) NOT NULL,
  duration_label VARCHAR(80) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('storeName', 'GAMING STORE'),
  ('whatsappNumber', ''),
  ('supportLink', 'https://discord.gg/bGCWtKXT'),
  ('paymentMethods', 'PayPal,Yape,BBVA,Remitly,Western Union')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
