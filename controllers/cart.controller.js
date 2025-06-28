const Cart = require("../models/cart");
const Product = require("../models/product");
const Offer = require("../models/offer");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse } = require("../utils/api_response");

// @desc    Get user cart
// @route   GET /api/v1/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res, next) => {
  let cart = await Cart.findOne({ user: req.user._id })
    .populate("items.product", "name price discountPrice images productType")
    .populate("items.appliedOffer", "name code type value");

  if (!cart) {
    cart = await Cart.create({ user: req.user._id });
  }

  ApiResponse.success(res, cart);
});

// @desc    Add item to cart
// @route   POST /api/v1/cart/items
// @access  Private
exports.addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product) {
    return next(new ErrorResponse("Product not found", 404));
  }

  if (!product.isActive) {
    return next(new ErrorResponse("Product is not available", 400));
  }

  if (!product.isInStock()) {
    return next(new ErrorResponse("Product is out of stock", 400));
  }

  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id });
  }

  await cart.addItem(productId, quantity);

  cart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price discountPrice images"
  );

  ApiResponse.success(res, cart, "Item added to cart");
});

// @desc    Update cart item quantity
// @route   PUT /api/v1/cart/items/:productId
// @access  Private
exports.updateCartItem = asyncHandler(async (req, res, next) => {
  const { quantity } = req.body;
  const { productId } = req.params;

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new ErrorResponse("Cart not found", 404));
  }

  await cart.updateItemQuantity(productId, quantity);

  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price discountPrice images"
  );

  ApiResponse.success(res, updatedCart, "Cart updated successfully");
});

// @desc    Remove item from cart
// @route   DELETE /api/v1/cart/items/:productId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new ErrorResponse("Cart not found", 404));
  }

  await cart.removeItem(req.params.productId);

  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price discountPrice images"
  );

  ApiResponse.success(res, updatedCart, "Item removed from cart");
});

// @desc    Clear cart
// @route   DELETE /api/v1/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new ErrorResponse("Cart not found", 404));
  }

  await cart.clearCart();

  ApiResponse.success(res, cart, "Cart cleared successfully");
});

// @desc    Apply coupon to cart
// @route   POST /api/v1/cart/coupon
// @access  Private
exports.applyCoupon = asyncHandler(async (req, res, next) => {
  const { couponCode } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new ErrorResponse("Cart not found", 404));
  }

  const offer = await Offer.findOne({
    code: couponCode.toUpperCase(),
    isActive: true,
  });

  if (!offer) {
    return next(new ErrorResponse("Invalid coupon code", 400));
  }

  if (!offer.isValid()) {
    return next(new ErrorResponse("Coupon has expired", 400));
  }

  if (!offer.canUserUse(req.user._id)) {
    return next(new ErrorResponse("You have already used this coupon", 400));
  }

  // Apply offer
  const discount = offer.applyOffer(cart.subtotal);

  cart.couponCode = couponCode;
  cart.couponDiscount = discount;
  await cart.save();

  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price discountPrice images"
  );

  ApiResponse.success(res, updatedCart, "Coupon applied successfully");
});

// @desc    Remove coupon from cart
// @route   DELETE /api/v1/cart/coupon
// @access  Private
exports.removeCoupon = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new ErrorResponse("Cart not found", 404));
  }

  cart.couponCode = undefined;
  cart.couponDiscount = 0;
  await cart.save();

  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price discountPrice images"
  );

  ApiResponse.success(res, updatedCart, "Coupon removed successfully");
});
