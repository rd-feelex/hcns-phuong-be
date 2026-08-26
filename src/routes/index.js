const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');

// Đăng nhập (public)
router.use('/auth', require('./auth.routes'));

// Mọi API nghiệp vụ phía dưới đều yêu cầu đăng nhập
router.use(requireAuth);
router.use('/employees', require('./employee.routes'));
router.use('/salaries', require('./salary.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/payroll', require('./payroll.routes'));
router.use('/hr', require('./hr.routes'));

module.exports = router;
