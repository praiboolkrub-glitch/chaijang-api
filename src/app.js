const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/userRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const householdRoutes = require('./routes/householdRoutes');
const bankAccountRoutes = require('./routes/bankAccountRoutes');
const errorHandler = require('./middleware/errorHandler');
const db = require('./db/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const startServer = async () => {
    await db.connect();
    await db.initialize();

    userRoutes(app);
    expenseRoutes(app);
    householdRoutes(app);
    bankAccountRoutes(app);

    app.use(errorHandler);

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
});