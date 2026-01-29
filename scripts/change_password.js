const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../database/users.db');
const db = new Database(DB_PATH);

const newPassword = process.argv[2];

if (!newPassword) {
    console.error('Usage: node scripts/change_password.js <new_password>');
    process.exit(1);
}

try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?');
    const info = stmt.run(hash, 'admin');

    if (info.changes > 0) {
        console.log('✅ Password for user "admin" updated successfully.');
    } else {
        console.error('❌ User "admin" not found.');
    }
} catch (error) {
    console.error('❌ Error updating password:', error.message);
}
