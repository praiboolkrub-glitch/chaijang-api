const express = require('express');
const bankAccountController = require('../controllers/bankAccountController');

const router = express.Router();

const setBankAccountRoutes = (app) => {
    router.post('/bank-accounts', bankAccountController.createBankAccount);
    router.get('/bank-accounts', bankAccountController.getBankAccounts);
    router.get('/bank-accounts/:id', bankAccountController.getBankAccount);
    router.put('/bank-accounts/:id', bankAccountController.updateBankAccount);
    router.delete('/bank-accounts/:id', bankAccountController.deleteBankAccount);

    app.use('/api', router);
};

module.exports = setBankAccountRoutes;