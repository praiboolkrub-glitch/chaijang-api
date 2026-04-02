const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
          user: process.env.DB_USER,
          host: process.env.DB_HOST,
          database: process.env.DB_NAME,
          password: process.env.DB_PASSWORD,
          port: process.env.DB_PORT,
      };

const pool = new Pool(poolConfig);

const connect = async () => {
    try {
        const client = await pool.connect();
        client.release();
        console.log('Connected to the PostgreSQL database');
    } catch (err) {
        console.error('Failed to connect to the database', err);
        process.exit(1);
    }
};

const initialize = async () => {
    const createHouseholdsTable = `
        CREATE TABLE IF NOT EXISTS households (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
        )`;

    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            email VARCHAR(255) UNIQUE,
            password VARCHAR(255),
            line_mid VARCHAR(255) UNIQUE,
            household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
        )`;

    const createCategoriesTable = `
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
        )`;

    const createBankAccountsTable = `
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id SERIAL PRIMARY KEY,
            household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            bank_name VARCHAR(150),
            account_number VARCHAR(100) UNIQUE,
            balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
            is_primary BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
        )`;

    const createExpensesTable = `
        CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
            transaction_type VARCHAR(20) NOT NULL DEFAULT 'expense',
            title VARCHAR(255),
            amount NUMERIC(12, 2) NOT NULL,
            notes TEXT,
            expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
        )`;

    await pool.query(createHouseholdsTable);
    await pool.query(createUsersTable);
    await pool.query(createCategoriesTable);
    await pool.query(createBankAccountsTable);
    await pool.query(createExpensesTable);

    await pool.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE expenses ALTER COLUMN title DROP NOT NULL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS line_mid VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
    await pool.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
    await pool.query(`DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_line_mid_key'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_line_mid_key UNIQUE (line_mid);
    END IF;
END$$;`);
};

const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    connect,
    initialize,
    withTransaction,
};