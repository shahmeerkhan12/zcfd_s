import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { menu } from '../../data-mock/menu.js'

const baseMenuIds = new Set(menu.map((item) => item.id))

const databaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')
const databasePath = process.env.DATABASE_PATH || path.join(databaseDirectory, 'food-delivery.sqlite')
const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

fs.mkdirSync(databaseDirectory, { recursive: true })

export const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON')
database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')

function applyMigrations() {
  const appliedVersions = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map(({ version }) => version),
  )
  const migrations = fs.readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()

  for (const migration of migrations) {
    const version = Number.parseInt(migration, 10)
    if (appliedVersions.has(version)) continue
    const sql = fs.readFileSync(path.join(migrationsDirectory, migration), 'utf8')
    database.exec('BEGIN')
    try {
      database.exec(sql)
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }
  }
}

applyMigrations()

export function seedDatabase(menu) {
  const insertRestaurant = database.prepare(`
    INSERT INTO restaurants (name, rating, is_open, address, lat, lng)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      rating = excluded.rating,
      is_open = 1,
      address = excluded.address,
      lat = excluded.lat,
      lng = excluded.lng
  `)
  const findRestaurant = database.prepare('SELECT id FROM restaurants WHERE name = ?')
  const insertMenuItem = database.prepare(`
    INSERT INTO menu_items (
      id, restaurant_id, title, description, price, prep_time_minutes,
      rating, image, tag, keywords, is_available
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      restaurant_id = excluded.restaurant_id,
      title = excluded.title,
      description = excluded.description,
      price = excluded.price,
      prep_time_minutes = excluded.prep_time_minutes,
      rating = excluded.rating,
      image = excluded.image,
      tag = excluded.tag,
      keywords = excluded.keywords,
      is_available = 1
  `)

  database.exec('BEGIN')
  try {
    for (const item of menu) {
      const prepTimeMinutes = Number.parseInt(item.time, 10)
      if (!Number.isInteger(prepTimeMinutes) || prepTimeMinutes <= 0) {
        throw new Error(`Invalid preparation time for menu item "${item.id}".`)
      }
      insertRestaurant.run(
        item.restaurant,
        Number(item.rating),
        item.address ?? 'Kyiv, Ukraine',
        item.lat ?? 50.4501,
        item.lng ?? 30.5234,
      )
      const restaurant = findRestaurant.get(item.restaurant)
      insertMenuItem.run(
        item.id,
        restaurant.id,
        item.name,
        item.description,
        item.price,
        prepTimeMinutes,
        Number(item.rating),
        item.image ?? null,
        item.tag ?? null,
        JSON.stringify(item.keywords),
      )
    }
    database.exec('COMMIT')
  } catch (err) {
    database.exec('ROLLBACK')
    throw err
  }
}

export function listAvailableMenuItems() {
  const rows = database.prepare(`
    SELECT menu_items.id, menu_items.title AS name, restaurants.name AS restaurant,
      restaurants.address AS restaurantAddress,
      restaurants.lat AS restaurantLat, restaurants.lng AS restaurantLng,
      menu_items.description, menu_items.price, menu_items.rating,
      menu_items.prep_time_minutes, menu_items.image, menu_items.tag, menu_items.keywords
    FROM menu_items
    JOIN restaurants ON restaurants.id = menu_items.restaurant_id
    WHERE menu_items.is_available = 1 AND restaurants.is_open = 1
    ORDER BY menu_items.id
  `).all()

  return rows.filter((item) => baseMenuIds.has(item.id)).map((item) => ({
    ...item,
    rating: String(item.rating),
    time: `${item.prep_time_minutes}–${item.prep_time_minutes + 10} min`,
    keywords: JSON.parse(item.keywords),
  }))
}

export function findMenuItem(id) {
  if (!baseMenuIds.has(id)) return undefined
  return database.prepare(`
    SELECT menu_items.id, menu_items.title AS name, restaurants.name AS restaurant,
      restaurants.id AS restaurant_id, menu_items.price
    FROM menu_items
    JOIN restaurants ON restaurants.id = menu_items.restaurant_id
    WHERE menu_items.id = ? AND menu_items.is_available = 1 AND restaurants.is_open = 1
  `).get(id)
}

export function insertOrder(order) {
  database.prepare(`
    INSERT INTO orders (
      tracking_number, customer_name, address, payment_method, payment_status,
      status, restaurant_id, menu_item_id, total_amount, created_at, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.trackingNumber,
    order.customerName,
    order.address,
    order.paymentMethod,
    order.paymentStatus,
    order.status,
    order.restaurantId,
    order.menuItemId,
    order.totalAmount,
    order.createdAt,
    order.createdAtMs,
  )
}

export function findOrder(trackingNumber) {
  return database.prepare(`
    SELECT orders.tracking_number AS trackingNumber, orders.customer_name AS customerName,
      orders.address, orders.payment_method AS paymentMethod,
      orders.payment_status AS paymentStatus, orders.created_at AS createdAt,
      orders.created_at_ms AS createdAtMs, menu_items.id AS itemId,
      menu_items.title AS itemName, restaurants.name AS itemRestaurant,
      menu_items.price AS itemPrice
    FROM orders
    JOIN menu_items ON menu_items.id = orders.menu_item_id
    JOIN restaurants ON restaurants.id = orders.restaurant_id
    WHERE orders.tracking_number = ?
  `).get(trackingNumber)
}
