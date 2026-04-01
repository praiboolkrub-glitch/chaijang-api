const express = require('express');
const householdController = require('../controllers/householdController');

const router = express.Router();

const setHouseholdRoutes = (app) => {
    router.post('/households', householdController.createHousehold);
    router.get('/households', householdController.getHouseholds);
    router.get('/households/:id', householdController.getHousehold);
    router.put('/households/:id', householdController.updateHousehold);
    router.delete('/households/:id', householdController.deleteHousehold);

    app.use('/api', router);
};

module.exports = setHouseholdRoutes;
