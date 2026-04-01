const express = require('express');
const expenseController = require('../controllers/expenseController');

const router = express.Router();

const setExpenseRoutes = (app) => {
    router.post('/categories', expenseController.createCategory);
    router.get('/categories', expenseController.getCategories);
    router.get('/categories/:id', expenseController.getCategory);
    router.put('/categories/:id', expenseController.updateCategory);
    router.delete('/categories/:id', expenseController.deleteCategory);

    router.post('/expenses', expenseController.createExpense);
    router.get('/expenses', expenseController.getExpenses);
    router.get('/expenses/:id', expenseController.getExpense);
    router.get('/transactions', expenseController.getTransactions);
    router.get('/transactions/:id', expenseController.getExpense);
    router.put('/expenses/:id', expenseController.updateExpense);
    router.delete('/expenses/:id', expenseController.deleteExpense);

    app.use('/api', router);
};

module.exports = setExpenseRoutes;
