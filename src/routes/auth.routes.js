const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

router.post('/login', controller.login);
router.get('/me', requireAuth, controller.me);

// Quản trị tài khoản — chỉ admin
router.get('/users', requireAuth, requireAdmin, controller.listUsers);
router.post('/users', requireAuth, requireAdmin, controller.createUser);
router.put('/users/:id', requireAuth, requireAdmin, controller.updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, controller.deleteUser);

module.exports = router;
