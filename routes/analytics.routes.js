const express = require("express");
const router = express.Router();
const {
  getRevenueAnalytics,
  getProductAnalytics,
  getCustomerAnalytics,
  getConversionAnalytics,
} = require("../controllers/analytics.controller");
const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../config/constants");

// All analytics routes require admin access
router.use(protect, authorize(ROLES.ADMIN));

router.get("/revenue", getRevenueAnalytics);
router.get("/products", getProductAnalytics);
router.get("/customers", getCustomerAnalytics);
router.get("/conversion", getConversionAnalytics);

module.exports = router;
