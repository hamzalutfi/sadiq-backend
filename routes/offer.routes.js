const express = require("express");
const router = express.Router();
const {
  getOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
  getActiveOffers,
} = require("../controllers/offer.controller");
const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../config/constants");

router.get("/active", getActiveOffers);

router
  .route("/")
  .get(getOffers)
  .post(protect, authorize(ROLES.ADMIN), createOffer);

router
  .route("/:id")
  .get(getOffer)
  .put(protect, authorize(ROLES.ADMIN), updateOffer)
  .delete(protect, authorize(ROLES.ADMIN), deleteOffer);

module.exports = router;
