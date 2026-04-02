const db = require('../db/index');

class UserController {
    async createUser(req, res, next) {
        try {
            const { username, display_name, profile_picture, email, password, household_id, line_mid } = req.body;
            const normalizedLineMid = line_mid ? String(line_mid).trim() : null;
            let userName = username ? String(username).trim() : null;

            if (!userName && normalizedLineMid) {
                userName = `line_${normalizedLineMid}`;
                if (userName.length > 100) {
                    userName = userName.slice(0, 100);
                }
            }

            if (!userName) {
                return res.status(400).json({ success: false, message: 'username or line_mid is required' });
            }

            if (!normalizedLineMid && (!email || !password)) {
                return res.status(400).json({ success: false, message: 'Provide either line_mid or both email and password' });
            }

            if (household_id) {
                const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
                if (householdCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Household not found' });
                }
            }

            const result = await db.query(
                `INSERT INTO users (username, display_name, profile_picture, email, password, household_id, line_mid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, username, display_name, profile_picture, email, household_id, line_mid, created_at, updated_at`,
                [userName, display_name || null, profile_picture || null, email || null, password || null, household_id || null, normalizedLineMid]
            );

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Username, email, or LINE MID already exists' });
            }
            next(err);
        }
    }

    async getUser(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query(
                `SELECT u.id, u.username, u.display_name, u.profile_picture, u.email, u.household_id, h.name AS household_name, u.created_at, u.updated_at
                 FROM users u
                 LEFT JOIN households h ON u.household_id = h.id
                 WHERE u.id = $1`,
                [id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async updateUser(req, res, next) {
        try {
            const { id } = req.params;
            const { username, email, password, household_id, line_mid } = req.body;

            if (household_id) {
                const householdCheck = await db.query('SELECT id FROM households WHERE id = $1', [household_id]);
                if (householdCheck.rowCount === 0) {
                    return res.status(404).json({ success: false, message: 'Household not found' });
                }
            }

            const result = await db.query(
                `UPDATE users
                 SET username = COALESCE($1, username),
                     display_name = COALESCE($2, display_name),
                     profile_picture = COALESCE($3, profile_picture),
                     email = COALESCE($4, email),
                     password = COALESCE($5, password),
                     household_id = COALESCE($6, household_id),
                     line_mid = COALESCE($7, line_mid),
                     updated_at = now()
                 WHERE id = $8
                 RETURNING id, username, display_name, profile_picture, email, household_id, line_mid, created_at, updated_at`,
                [username, display_name, profile_picture, email, password, household_id, line_mid, id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Username, email, or LINE MID already exists' });
            }
            next(err);
        }
    }

    async getUserByLineMid(req, res, next) {
        try {
            const { line_mid } = req.params;
            const result = await db.query(
                `SELECT u.id, u.username, u.display_name, u.profile_picture, u.email, u.line_mid, u.household_id, h.name AS household_name, u.created_at, u.updated_at
                 FROM users u
                 LEFT JOIN households h ON u.household_id = h.id
                 WHERE u.line_mid = $1`,
                [line_mid]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async deleteUser(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({ success: true, message: 'User deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new UserController();