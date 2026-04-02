const db = require('../db/index');

class BankAccountController {
    async createBankAccount(req, res, next) {
        try {
            const { household_id, user_id, name, bank_name, account_number, balance, is_primary } = req.body;
            const accountOwnerId = user_id || null;

            if (!accountOwnerId && !household_id) {
                return res.status(400).json({ success: false, message: 'user_id or household_id is required' });
            }

            if (!name) {
                return res.status(400).json({ success: false, message: 'name is required' });
            }

            if (accountOwnerId) {
                const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [accountOwnerId]);
                if (userCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }
            }

            if (household_id) {
                const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
                if (householdCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Household not found' });
                }
            }

            let primary = Boolean(is_primary);
            if (accountOwnerId) {
                const existing = await db.query('SELECT id FROM bank_accounts WHERE user_id = $1', [accountOwnerId]);
                if (existing.rowCount === 0) {
                    primary = true;
                }
                if (primary) {
                    await db.query('UPDATE bank_accounts SET is_primary = false WHERE user_id = $1', [accountOwnerId]);
                }
            }

            const result = await db.query(
                `INSERT INTO bank_accounts (household_id, user_id, name, bank_name, account_number, balance, is_primary)
                 VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), $7)
                 RETURNING *`,
                [household_id || null, accountOwnerId, name, bank_name, account_number, balance, primary]
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
            const { household_id, user_id } = req.query;
            const values = [];
            let query = 'SELECT * FROM bank_accounts';

            if (user_id) {
                values.push(user_id);
                query += ` WHERE user_id = $${values.length}`;
            } else if (household_id) {
                values.push(household_id);
                query += ` WHERE household_id = $${values.length}`;
            }

            query += ' ORDER BY is_primary DESC, id';
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
            const { household_id, user_id, name, bank_name, account_number, balance, is_primary } = req.body;

            if (user_id) {
                const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [user_id]);
                if (userCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }
            }

            if (household_id) {
                const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
                if (householdCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Household not found' });
                }
            }

            const existingResult = await db.query('SELECT user_id FROM bank_accounts WHERE id = $1', [id]);
            if (existingResult.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Bank account not found' });
            }

            const targetUserId = user_id || existingResult.rows[0].user_id;
            if (is_primary && targetUserId) {
                await db.query('UPDATE bank_accounts SET is_primary = false WHERE user_id = $1', [targetUserId]);
            }

            const result = await db.query(
                `UPDATE bank_accounts
                 SET household_id = COALESCE($1, household_id),
                     user_id = COALESCE($2, user_id),
                     name = COALESCE($3, name),
                     bank_name = COALESCE($4, bank_name),
                     account_number = COALESCE($5, account_number),
                     balance = COALESCE($6, balance),
                     is_primary = COALESCE($7, is_primary),
                     updated_at = now()
                 WHERE id = $8
                 RETURNING *`,
                [household_id, user_id, name, bank_name, account_number, balance, is_primary, id]
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