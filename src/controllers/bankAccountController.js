const db = require('../db/index');

class BankAccountController {
    async createBankAccount(req, res, next) {
        try {
            const { household_id, name, bank_name, account_number, balance } = req.body;

            if (!household_id || !name) {
                return res.status(400).json({ success: false, message: 'household_id and name are required' });
            }

            const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
            if (householdCheck.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Household not found' });
            }

            const result = await db.query(
                `INSERT INTO bank_accounts (household_id, name, bank_name, account_number, balance)
                 VALUES ($1, $2, $3, $4, COALESCE($5, 0))
                 RETURNING *`,
                [household_id, name, bank_name, account_number, balance]
            );

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Account number already exists' });
            }
            next(err);
        }
    }

    async getBankAccounts(req, res, next) {
        try {
            const { household_id } = req.query;
            const values = [];
            let query = 'SELECT * FROM bank_accounts';

            if (household_id) {
                values.push(household_id);
                query += ` WHERE household_id = $${values.length}`;
            }

            query += ' ORDER BY id';
            const result = await db.query(query, values);
            res.json({ success: true, data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    async getBankAccount(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('SELECT * FROM bank_accounts WHERE id = $1', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Bank account not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async updateBankAccount(req, res, next) {
        try {
            const { id } = req.params;
            const { household_id, name, bank_name, account_number, balance } = req.body;

            if (household_id) {
                const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
                if (householdCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Household not found' });
                }
            }

            const result = await db.query(
                `UPDATE bank_accounts
                 SET household_id = COALESCE($1, household_id),
                     name = COALESCE($2, name),
                     bank_name = COALESCE($3, bank_name),
                     account_number = COALESCE($4, account_number),
                     balance = COALESCE($5, balance),
                     updated_at = now()
                 WHERE id = $6
                 RETURNING *`,
                [household_id, name, bank_name, account_number, balance, id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Bank account not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Account number already exists' });
            }
            next(err);
        }
    }

    async deleteBankAccount(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('DELETE FROM bank_accounts WHERE id = $1 RETURNING *', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Bank account not found' });
            }

            res.json({ success: true, message: 'Bank account deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new BankAccountController();