const express = require("express");
const router = express.Router();
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
} = require("../controllers/cart.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect); // All cart routes require authentication

router.route("/").get(getCart).delete(clearCart);

router.post("/items", addToCart);
router.route("/items/:productId").put(updateCartItem).delete(removeFromCart);

router.route("/coupon").post(applyCoupon).delete(removeCoupon);

module.exports = router;
