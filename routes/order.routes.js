const express = require("express");
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrder,
  cancelOrder,
  requestRefund,
} = require("../controllers/order.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect); // All order routes require authentication

router.route("/").get(getUserOrders).post(createOrder);

router.get("/:id", getOrder);
router.put("/:id/cancel", cancelOrder);
router.post("/:id/refund", requestRefund);

module.exports = router;
