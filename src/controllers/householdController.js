const db = require('../db/index');

class HouseholdController {
    async createHousehold(req, res, next) {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ success: false, message: 'Household name is required' });
            }

            const result = await db.query(
                'INSERT INTO households (name, description) VALUES ($1, $2) RETURNING *',
                [name, description]
            );

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Household already exists' });
            }
            next(err);
        }
    }

    async getHouseholds(req, res, next) {
        try {
            const result = await db.query('SELECT * FROM households ORDER BY id');
            res.json({ success: true, data: result.rows });
        } catch (err) {
            next(err);
        }
    }

    async getHousehold(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('SELECT * FROM households WHERE id = $1', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Household not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }

    async updateHousehold(req, res, next) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            const result = await db.query(
                'UPDATE households SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = now() WHERE id = $3 RETURNING *',
                [name, description, id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Household not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ success: false, message: 'Household name already in use' });
            }
            next(err);
        }
    }

    async deleteHousehold(req, res, next) {
        try {
            const { id } = req.params;
            const result = await db.query('DELETE FROM households WHERE id = $1 RETURNING *', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, message: 'Household not found' });
            }

            res.json({ success: true, message: 'Household deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new HouseholdController();