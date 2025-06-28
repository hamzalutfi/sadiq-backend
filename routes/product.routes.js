const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  addReview,
} = require("../controllers/product.controller");
const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../config/constants");
const upload = require("../middleware/upload.middleware");

router
  .route("/")
  .get(getProducts)
  .post(protect, authorize(ROLES.ADMIN), upload.array('images', 5), createProduct);

router
  .route("/:id")
  .get(getProduct)
  .put(protect, authorize(ROLES.ADMIN), updateProduct)
  .delete(protect, authorize(ROLES.ADMIN), deleteProduct);

router.get("/category/:categorySlug", getProductsByCategory);
router.post("/:id/reviews", protect, addReview);

module.exports = router;
