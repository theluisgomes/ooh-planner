/**
 * Auth Service
 * Handles user authentication and management using SQLite
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../database/users.db');

class AuthService {
    constructor() {
        this.db = null;
    }

    initialize() {
        try {
            this.db = new Database(DB_PATH);

            // Create users table if not exists
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            `);

            // Check if default user exists, if not create one
            const stmt = this.db.prepare('SELECT count(*) as count FROM users');
            const result = stmt.get();

            if (result.count === 0) {
                console.log('🔒 No users found. Creating default admin user.');
                this.createUser('admin', 'admin123');
            }

            console.log('✅ Auth service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Auth service:', error.message);
        }
    }

    savePlan(userId, name, data) {
        try {
            const stmt = this.db.prepare('INSERT INTO plans (user_id, name, data) VALUES (?, ?, ?)');
            const info = stmt.run(userId, name, JSON.stringify(data));
            console.log(`💾 Plan '${name}' saved for user ${userId}.`);
            return info.lastInsertRowid;
        } catch (error) {
            console.error('Error saving plan:', error.message);
            throw error;
        }
    }

    getUserPlans(userId) {
        try {
            const stmt = this.db.prepare('SELECT id, name, created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC');
            return stmt.all(userId);
        } catch (error) {
            console.error('Error fetching user plans:', error.message);
            return [];
        }
    }

    getPlanById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM plans WHERE id = ?');
            const plan = stmt.get(id);
            if (plan) {
                plan.data = JSON.parse(plan.data);
            }
            return plan;
        } catch (error) {
            console.error('Error fetching plan by id:', error.message);
            return null;
        }
    }

    createUser(username, password) {
        try {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(password, salt);

            const stmt = this.db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
            const info = stmt.run(username, hash);

            console.log(`👤 User '${username}' created successfully.`);
            return info.lastInsertRowid;
        } catch (error) {
            console.error(`Error creating user ${username}:`, error.message);
            throw error;
        }
    }

    verifyUser(username, password) {
        try {
            const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
            const user = stmt.get(username);

            if (!user) {
                return false;
            }

            return bcrypt.compareSync(password, user.password_hash) ? user : false;
        } catch (error) {
            console.error('Error verifying user:', error.message);
            return false;
        }
    }
}

module.exports = new AuthService();
