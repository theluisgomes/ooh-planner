const path = require('path');
const authService = require('../services/auth-service');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../database/users.db');

try {
    // 1. Initialize Service (creates DB/User if missing)
    console.log('Initializing Auth Service...');
    authService.initialize();

    // 2. Inspect Database
    console.log('\n--- Inspecting User Database ---');
    const db = new Database(DB_PATH, { readonly: true });

    const users = db.prepare('SELECT id, username, created_at, password_hash FROM users').all();

    console.log(`\nFound ${users.length} user(s):`);
    console.table(users.map(u => ({
        id: u.id,
        username: u.username,
        created_at: u.created_at,
        password_hash: u.password_hash.substring(0, 20) + '...'
    })));

    // 3. Test Credentials
    const testUser = 'admin';
    const testPass = 'admin123';

    console.log(`\nTesting credentials for '${testUser}':`);
    const verified = authService.verifyUser(testUser, testPass);
    console.log(verified ? '✅ VALID' : '❌ INVALID');

} catch (error) {
    console.error('Error in inspection:', error.message);
}
