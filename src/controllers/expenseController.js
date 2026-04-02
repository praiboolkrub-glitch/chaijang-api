const db = require('../db/index');
const https = require('https');
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const formatMoney = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
};

const buildLineFlexMessage = (transaction) => {
    const typeLabel = transaction.transaction_type === 'income' ? 'เงินเข้า' : 'เงินออก';
    const amountLabel = formatMoney(transaction.amount);
    const categoryName = transaction.category_name || '-';
    const bankName = transaction.bank_account_name || '-';
    const title = transaction.title || '-';
    const dateLabel = transaction.expense_date
        ? new Date(transaction.expense_date).toLocaleDateString('th-TH', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          })
        : new Date().toLocaleDateString('th-TH', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          });

    return {
        type: 'flex',
        altText: `${typeLabel} ${amountLabel}`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: typeLabel,
                        weight: 'bold',
                        size: 'lg',
                        color: transaction.transaction_type === 'income' ? '#0f766e' : '#b91c1c',
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: title,
                        weight: 'bold',
                        size: 'md',
                        wrap: true,
                    },
                    {
                        type: 'box',
                        layout: 'baseline',
                        contents: [
                            { type: 'text', text: 'วันที่', color: '#64748b', size: 'sm', flex: 2 },
                            { type: 'text', text: dateLabel, color: '#0f172a', size: 'sm', flex: 3 },
                        ],
                    },
                    {
                        type: 'box',
                        layout: 'baseline',
                        contents: [
                            { type: 'text', text: 'หมวดหมู่', color: '#64748b', size: 'sm', flex: 2 },
                            { type: 'text', text: categoryName, color: '#0f172a', size: 'sm', flex: 3 },
                        ],
                    },
                    {
                        type: 'box',
                        layout: 'baseline',
                        contents: [
                            { type: 'text', text: 'บัญชี', color: '#64748b', size: 'sm', flex: 2 },
                            { type: 'text', text: bankName, color: '#0f172a', size: 'sm', flex: 3 },
                        ],
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: amountLabel,
                        weight: 'bold',
                        size: 'xl',
                        color: transaction.transaction_type === 'income' ? '#0f766e' : '#b91c1c',
                        align: 'end',
                    },
                ],
            },
        },
    };
};

const sendLinePushMessage = (recipient, message) => {
    return new Promise((resolve, reject) => {
        if (!LINE_CHANNEL_ACCESS_TOKEN) {
            return reject(new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured'));
        }

        const payload = JSON.stringify({ to: recipient, messages: [message] });
        const req = https.request(LINE_PUSH_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(responseBody ? JSON.parse(responseBody) : {});
                    } catch (parseErr) {
                        resolve({});
                    }
                } else {
                    const error = new Error(`LINE push failed with status ${res.statusCode}`);
                    error.response = responseBody;
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
};

const sendHouseholdLineNotifications = async (householdId, excludeUserId, transactionId) => {
    if (!LINE_CHANNEL_ACCESS_TOKEN || !householdId) {
        return;
    }

    let query = "SELECT line_mid FROM users WHERE household_id = $1 AND line_mid IS NOT NULL AND line_mid <> ''";
    const values = [householdId];
    if (excludeUserId) {
        query += ' AND id <> $2';
        values.push(excludeUserId);
    }

    const userResult = await db.query(query, values);
    const recipients = userResult.rows.map((row) => row.line_mid).filter(Boolean);
    if (!recipients.length) {
        return;
    }

    const transactionResult = await db.query(
        `SELECT e.*, c.name AS category_name, b.name AS bank_account_name
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        LEFT JOIN bank_accounts b ON e.bank_account_id = b.id
        WHERE e.id = $1`,
        [transactionId]
    );
    const transaction = transactionResult.rows[0];
    if (!transaction) {
        return;
    }

    const message = buildLineFlexMessage(transaction);
    await Promise.allSettled(recipients.map((recipient) => sendLinePushMessage(recipient, message)));
};

class ExpenseController {
    async createCategory(req, res, next) {
        try {
            const { name, description, transaction_type } = req.body;
            const type = transaction_type && ['income', 'expense'].includes(transaction_type.toLowerCase())
                ? transaction_type.toLowerCase()
                : 'expense';

            if (!name) {
                return res.status(400).json({ success: false, message: 'Category name is required' });
            }

            const result = await db.query(
                'INSERT INTO categories (name, description, transaction_type) VALUES ($1, $2, $3) RETURNING *',
                [name, description, type]
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
            const result = await db.query('SELECT * FROM categories ORDER BY transaction_type, name');
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
            const { name, description, transaction_type } = req.body;
            const type = transaction_type && ['income', 'expense'].includes(transaction_type.toLowerCase())
                ? transaction_type.toLowerCase()
                : null;

            const result = await db.query(
                'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), transaction_type = COALESCE($3, transaction_type), updated_at = now() WHERE id = $4 RETURNING *',
                [name, description, type, id]
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
                const categoryCheck = await db.query('SELECT id, transaction_type FROM categories WHERE id = $1', [category_id]);
                if (categoryCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Category not found' });
                }
                if (categoryCheck.rows[0].transaction_type !== type) {
                    return res.status(400).json({ success: false, message: 'Category type must match transaction_type' });
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

            if (result.rows[0]) {
                sendHouseholdLineNotifications(householdId, user_id, result.rows[0].id).catch((err) =>
                    console.warn('Failed to send LINE household notification', err)
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
            let query = `SELECT e.*, c.name AS category_name, c.transaction_type AS category_type,
                             COALESCE(u.display_name, u.username) AS user_name, u.profile_picture AS user_profile_picture,
                             b.name AS bank_account_name
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
            let query = `SELECT e.*, c.name AS category_name, c.transaction_type AS category_type,
                             COALESCE(u.display_name, u.username) AS user_name, u.profile_picture AS user_profile_picture,
                             b.name AS bank_account_name
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
                `SELECT e.*, c.name AS category_name, c.transaction_type AS category_type,
                         COALESCE(u.display_name, u.username) AS user_name, u.profile_picture AS user_profile_picture,
                         b.name AS bank_account_name
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
