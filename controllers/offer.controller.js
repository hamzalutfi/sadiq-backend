const Offer = require("../models/offer");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse, getPaginationData } = require("../utils/api_response");

// @desc    Get all offers
// @route   GET /api/v1/offers
// @access  Public
exports.getOffers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  let query = {};

  // Filter by type
  if (req.query.type) {
    query.type = req.query.type;
  }

  // Filter by active status
  if (req.query.isActive !== undefined) {
    query.isActive = req.query.isActive === "true";
  }

  const offers = await Offer.find(query)
    .populate("applicableProducts", "name")
    .populate("applicableCategories", "name")
    .sort("-createdAt")
    .limit(limit)
    .skip(skip);

  const total = await Offer.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, offers, pagination);
});

// @desc    Get active offers
// @route   GET /api/v1/offers/active
// @access  Public
exports.getActiveOffers = asyncHandler(async (req, res, next) => {
  const now = new Date();

  const offers = await Offer.find({
    isActive: true,
    "validity.startDate": { $lte: now },
    "validity.endDate": { $gte: now },
  })
    .populate("applicableProducts", "name price")
    .populate("applicableCategories", "name");

  ApiResponse.success(res, offers);
});

// @desc    Get single offer
// @route   GET /api/v1/offers/:id
// @access  Public
exports.getOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id)
    .populate("applicableProducts")
    .populate("applicableCategories")
    .populate("createdBy", "fullName email");

  if (!offer) {
    return next(new ErrorResponse("Offer not found", 404));
  }

  ApiResponse.success(res, offer);
});

// @desc    Create offer
// @route   POST /api/v1/offers
// @access  Private/Admin
exports.createOffer = asyncHandler(async (req, res, next) => {
  req.body.createdBy = req.user._id;

  const offer = await Offer.create(req.body);

  ApiResponse.success(res, offer, "Offer created successfully", 201);
});

// @desc    Update offer
// @route   PUT /api/v1/offers/:id
// @access  Private/Admin
exports.updateOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!offer) {
    return next(new ErrorResponse("Offer not found", 404));
  }

  ApiResponse.success(res, offer, "Offer updated successfully");
});

// @desc    Delete offer
// @route   DELETE /api/v1/offers/:id
// @access  Private/Admin
exports.deleteOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return next(new ErrorResponse("Offer not found", 404));
  }

  // Soft delete
  offer.isActive = false;
  await offer.save();

  ApiResponse.success(res, null, "Offer deleted successfully");
});
