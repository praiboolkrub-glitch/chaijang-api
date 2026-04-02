const db = require('../db/index');

class ExpenseController {
    async createCategory(req, res, next) {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ success: false, message: 'Category name is required' });
            }

            const result = await db.query(
                'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
                [name, description]
            );

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Category already exists' });
            }
            next(err);
        }
    }

    async getCategories(req, res, next) {
        try {
            const result = await db.query('SELECT * FROM categories ORDER BY id');
            res.json({ success: true, data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    async getCategory(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('SELECT * FROM categories WHERE id = $1', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Category not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async updateCategory(req, res, next) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;

            const result = await db.query(
                'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = now() WHERE id = $3 RETURNING *',
                [name, description, id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Category not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Category name already in use' });
            }
            next(err);
        }
    }

    async deleteCategory(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Category not found' });
            }

            res.json({ success: true, message: 'Category deleted' });
        } catch (err) {
            next(err);
        }
    }

    async createExpense(req, res, next) {
        try {
            const { user_id, category_id, bank_account_id, transaction_type, title, amount, notes, expense_date } = req.body;
            const type = transaction_type ? transaction_type.toLowerCase() : 'expense';

            if (amount === undefined) {
                return res.status(400).json({ success: false, message: 'Amount is required' });
            }

            if (!['expense', 'income'].includes(type)) {
                return res.status(400).json({ success: false, message: 'transaction_type must be expense or income' });
            }

            let householdId = null;
            if (user_id) {
                const userResult = await db.query('SELECT household_id FROM users WHERE id = $1', [user_id]);
                if (userResult.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }
                householdId = userResult.rows[0].household_id;
                if (!householdId) {
                    return res.status(400).json({ success: false, message: 'User must belong to a household' });
                }
            }

            if (category_id) {
                const categoryCheck = await db.query('SELECT id FROM categories WHERE id = $1', [category_id]);
                if (categoryCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Category not found' });
                }
            }

            let selectedBankAccountId = bank_account_id;
            if (!selectedBankAccountId && user_id) {
                const accountResult = await db.query(
                    `SELECT id FROM bank_accounts WHERE user_id = $1 ORDER BY is_primary DESC, id LIMIT 1`,
                    [user_id]
                );
                if (accountResult.rowCount > 0) {
                    selectedBankAccountId = accountResult.rows[0].id;
                }
            }

            let delta = type === 'income' ? amount : -amount;
            let result;

            if (selectedBankAccountId) {
                const accountCheck = await db.query('SELECT id FROM bank_accounts WHERE id = $1', [selectedBankAccountId]);
                if (accountCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Bank account not found' });
                }

                result = await db.withTransaction(async (client) => {
                    const insertResult = await client.query(
                        `INSERT INTO expenses (user_id, household_id, category_id, bank_account_id, transaction_type, title, amount, notes, expense_date)
                         VALUES ($1, $2, $3, $4, $5, COALESCE($6, ''), $7, $8, COALESCE($9, CURRENT_DATE))
                         RETURNING *`,
                        [user_id, householdId, category_id, selectedBankAccountId, type, title, amount, notes, expense_date]
                    );

                    await client.query('UPDATE bank_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2', [delta, selectedBankAccountId]);
                    return insertResult;
                });
            } else {
                result = await db.query(
                    `INSERT INTO expenses (user_id, household_id, category_id, transaction_type, title, amount, notes, expense_date)
                     VALUES ($1, $2, $3, $4, COALESCE($5, ''), $6, $7, COALESCE($8, CURRENT_DATE))
                     RETURNING *`,
                    [user_id, householdId, category_id, type, title, amount, notes, expense_date]
                );
            }

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async getExpenses(req, res, next) {
        try {
            const { category_id, user_id, bank_account_id, household_id } = req.query;
            const values = [];
            let query = `SELECT e.*, c.name AS category_name, u.username AS user_name, b.name AS bank_account_name
                         FROM expenses e
                         LEFT JOIN categories c ON e.category_id = c.id
                         LEFT JOIN users u ON e.user_id = u.id
                         LEFT JOIN bank_accounts b ON e.bank_account_id = b.id`;

            const conditions = [];
            if (category_id) {
                values.push(category_id);
                conditions.push(`e.category_id = $${values.length}`);
            }
            if (user_id) {
                values.push(user_id);
                conditions.push(`e.user_id = $${values.length}`);
            }
            if (bank_account_id) {
                values.push(bank_account_id);
                conditions.push(`e.bank_account_id = $${values.length}`);
            }
            if (household_id) {
                values.push(household_id);
                conditions.push(`e.household_id = $${values.length}`);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY e.expense_date DESC';
            const result = await db.query(query, values);

            res.json({ success: true, data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    async getTransactions(req, res, next) {
        try {
            const { category_id, user_id, bank_account_id, transaction_type, household_id } = req.query;
            const values = [];
            let query = `SELECT e.*, c.name AS category_name, u.username AS user_name, b.name AS bank_account_name
                         FROM expenses e
                         LEFT JOIN categories c ON e.category_id = c.id
                         LEFT JOIN users u ON e.user_id = u.id
                         LEFT JOIN bank_accounts b ON e.bank_account_id = b.id`;

            const conditions = [];
            if (category_id) {
                values.push(category_id);
                conditions.push(`e.category_id = $${values.length}`);
            }
            if (user_id) {
                values.push(user_id);
                conditions.push(`e.user_id = $${values.length}`);
            }
            if (bank_account_id) {
                values.push(bank_account_id);
                conditions.push(`e.bank_account_id = $${values.length}`);
            }
            if (household_id) {
                values.push(household_id);
                conditions.push(`e.household_id = $${values.length}`);
            }
            if (transaction_type) {
                values.push(transaction_type);
                conditions.push(`e.transaction_type = $${values.length}`);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY e.expense_date DESC';
            const result = await db.query(query, values);

            res.json({ success: true, data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    async getExpense(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query(
                `SELECT e.*, c.name AS category_name, u.username AS user_name, b.name AS bank_account_name
                 FROM expenses e
                 LEFT JOIN categories c ON e.category_id = c.id
                 LEFT JOIN users u ON e.user_id = u.id
                 LEFT JOIN bank_accounts b ON e.bank_account_id = b.id
                 WHERE e.id = $1`,
                [id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Expense not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async updateExpense(req, res, next) {
        try {
            const { id } = req.params;
            const { user_id, category_id, bank_account_id, transaction_type, title, amount, notes, expense_date } = req.body;

            const existingResult = await db.query('SELECT * FROM expenses WHERE id = $1', [id]);
            if (existingResult.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Expense not found' });
            }

            const existing = existingResult.rows[0];
            const oldType = existing.transaction_type || 'expense';
            const oldAmount = existing.amount;
            const oldBankAccountId = existing.bank_account_id;
            const newType = transaction_type ? transaction_type.toLowerCase() : oldType;
            const newAmount = amount === undefined ? oldAmount : amount;

            if (!['expense', 'income'].includes(newType)) {
                return res.status(400).json({ success: false, message: 'transaction_type must be expense or income' });
            }

            let targetHouseholdId = null;
            if (user_id) {
                const userResult = await db.query('SELECT household_id FROM users WHERE id = $1', [user_id]);
                if (userResult.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }
                targetHouseholdId = userResult.rows[0].household_id;
                if (!targetHouseholdId) {
                    return res.status(400).json({ success: false, message: 'User must belong to a household' });
                }
            }

            if (category_id) {
                const categoryCheck = await db.query('SELECT id FROM categories WHERE id = $1', [category_id]);
                if (categoryCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Category not found' });
                }
            }

            if (bank_account_id) {
                const accountCheck = await db.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
                if (accountCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Bank account not found' });
                }
            }

            const oldDelta = oldType === 'income' ? oldAmount : -oldAmount;
            const newDelta = newType === 'income' ? newAmount : -newAmount;
            const finalBankAccountId = bank_account_id === undefined ? oldBankAccountId : bank_account_id;

            const result = await db.withTransaction(async (client) => {
                if (oldBankAccountId) {
                    await client.query('UPDATE bank_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2', [oldDelta, oldBankAccountId]);
                }

                if (finalBankAccountId) {
                    await client.query('UPDATE bank_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2', [newDelta, finalBankAccountId]);
                }

                return client.query(
                    `UPDATE expenses
                     SET user_id = COALESCE($1, user_id),
                         category_id = COALESCE($2, category_id),
                         bank_account_id = COALESCE($3, bank_account_id),
                         household_id = COALESCE($10, household_id),
                         transaction_type = COALESCE($4, transaction_type),
                         title = COALESCE($5, title),
                         amount = COALESCE($6, amount),
                         notes = COALESCE($7, notes),
                         expense_date = COALESCE($8, expense_date),
                         updated_at = now()
                     WHERE id = $9
                     RETURNING *`,
                    [user_id, category_id, bank_account_id, newType, title, amount, notes, expense_date, id, targetHouseholdId]
                );
            });

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Expense not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async deleteExpense(req, res, next) {
        try {
            const { id } = req.params;
            const existingResult = await db.query('SELECT bank_account_id, amount, transaction_type FROM expenses WHERE id = $1', [id]);
            if (existingResult.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Expense not found' });
            }

            const existing = existingResult.rows[0];
            const type = existing.transaction_type || 'expense';
            const amount = existing.amount;
            const delta = type === 'income' ? -amount : amount;

            await db.withTransaction(async (client) => {
                if (existing.bank_account_id) {
                    await client.query('UPDATE bank_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2', [delta, existing.bank_account_id]);
                }

                await client.query('DELETE FROM expenses WHERE id = $1', [id]);
            });

            res.json({ success: true, message: 'Expense deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ExpenseController();
