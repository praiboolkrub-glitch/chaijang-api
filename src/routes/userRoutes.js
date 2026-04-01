const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

const setUserRoutes = (app) => {
    router.post('/users', userController.createUser);
    router.get('/users/line/:line_mid', userController.getUserByLineMid);
    router.get('/users/:id', userController.getUser);
    router.put('/users/:id', userController.updateUser);
    router.delete('/users/:id', userController.deleteUser);

    app.use('/api', router);
};

module.exports = setUserRoutes;