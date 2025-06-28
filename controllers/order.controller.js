const Order = require("../models/order");
const Cart = require("../models/cart");
const Product = require("../models/product");
const Offer = require("../models/offer");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse, getPaginationData } = require("../utils/api_response");
const { sendEmail } = require("../utils/email.util");

// @desc    Create order (checkout)
// @route   POST /api/v1/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { shippingAddress, billingAddress, paymentMethod, paymentDetails } =
    req.body;

  // Get user's cart
  const cart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product"
  );

  if (!cart || cart.items.length === 0) {
    return next(new ErrorResponse("Cart is empty", 400));
  }

  // Verify all products are available
  for (const item of cart.items) {
    if (!item.product.isActive) {
      return next(
        new ErrorResponse(
          `Product \${item.product.name} is no longer available`,
          400
        )
      );
    }
    if (!item.product.isInStock()) {
      return next(
        new ErrorResponse(`Product \${item.product.name} is out of stock`, 400)
      );
    }
  }

  // Create order items
  const orderItems = await Promise.all(
    cart.items.map(async (item) => {
      const orderItem = {
        product: item.product._id,
        name: item.product.name,
        price: item.price,
        quantity: item.quantity,
      };

      // If digital product, prepare digital content
      if (item.product.productType !== "physical") {
        orderItem.digitalContent = {
          licenseKey: item.product.digitalContent?.licenseKey,
          downloadUrl: item.product.digitalContent?.downloadUrl,
          activationInstructions:
            item.product.digitalContent?.activationInstructions,
        };
      }

      return orderItem;
    })
  );

  // Create order
  const order = await Order.create({
    user: req.user._id,
    items: orderItems,
    shippingAddress: shippingAddress || req.user.address,
    billingAddress: billingAddress || shippingAddress || req.user.address,
    paymentMethod,
    paymentDetails,
    pricing: {
      subtotal: cart.subtotal,
      tax: cart.tax,
      shipping: cart.shipping,
      discount: cart.couponDiscount,
      total: cart.total,
    },
    metadata: {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      couponCode: cart.couponCode,
    },
  });

  // Update product inventory and purchase count
  for (const item of cart.items) {
    await item.product.decreaseQuantity(item.quantity);
    item.product.metadata.purchases += item.quantity;
    await item.product.save();
  }

  // Update offer usage if coupon was used
  if (cart.couponCode) {
    const offer = await Offer.findOne({ code: cart.couponCode });
    if (offer) {
      offer.usageCount += 1;
      offer.metadata.usedBy.push({
        user: req.user._id,
        usedAt: new Date(),
        orderId: order._id,
      });
      await offer.save();
    }
  }

  // Clear cart
  await cart.clearCart();

  // Send order confirmation email
  try {
    await sendEmail({
      email: req.user.email,
      subject: `Order Confirmation - #${order.orderNumber}`,
      template: "orderConfirmation",
      data: {
        name: req.user.fullName,
        orderNumber: order.orderNumber,
        items: orderItems,
        total: order.pricing.total,
      },
    });
  } catch (err) {
    console.error("Error sending order confirmation email:", err);
  }

  // Populate order before sending response
  const populatedOrder = await Order.findById(order._id).populate(
    "items.product",
    "name images"
  );

  ApiResponse.success(res, populatedOrder, "Order created successfully", 201);
});

// @desc    Get user orders
// @route   GET /api/v1/orders
// @access  Private
exports.getUserOrders = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  let query = { user: req.user._id };

  // Filter by status
  if (req.query.status) {
    query.status = req.query.status;
  }

  const orders = await Order.find(query)
    .populate("items.product", "name images")
    .sort("-createdAt")
    .limit(limit)
    .skip(skip);

  const total = await Order.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, orders, pagination);
});

// @desc    Get single order
// @route   GET /api/v1/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate("items.product", "name images description")
    .populate("user", "fullName email");

  if (!order) {
    return next(new ErrorResponse("Order not found", 404));
  }

  // Make sure user owns order
  if (order.user._id.toString() !== req.user._id && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized to access this order", 403));
  }

  ApiResponse.success(res, order);
});

// @desc    Cancel order
// @route   PUT /api/v1/orders/:id/cancel
// @access  Private
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse("Order not found", 404));
  }

  // Make sure user owns order
  if (order.user.toString() !== req.user._id) {
    return next(new ErrorResponse("Not authorized to cancel this order", 403));
  }

  // Check if order can be cancelled
  if (["completed", "cancelled", "refunded"].includes(order.status)) {
    return next(new ErrorResponse("Order cannot be cancelled", 400));
  }

  order.status = "cancelled";
  order.statusHistory.push({
    status: "cancelled",
    note: req.body.reason || "Cancelled by user",
    updatedBy: req.user._id,
  });

  // Restore inventory
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product && product.inventory.trackInventory) {
      product.inventory.quantity += item.quantity;
      product.metadata.purchases -= item.quantity;
      await product.save();
    }
  }

  await order.save();

  ApiResponse.success(res, order, "Order cancelled successfully");
});

// @desc    Request refund
// @route   POST /api/v1/orders/:id/refund
// @access  Private
exports.requestRefund = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse("Order not found", 404));
  }

  // Make sure user owns order
  if (order.user.toString() !== req.user._id) {
    return next(new ErrorResponse("Not authorized to request refund", 403));
  }

  if (order.status !== "completed") {
    return next(
      new ErrorResponse("Only completed orders can be refunded", 400)
    );
  }

  if (order.refund.requested) {
    return next(new ErrorResponse("Refund already requested", 400));
  }

  order.refund.requested = true;
  order.refund.requestedAt = new Date();
  order.refund.reason = reason;

  await order.save();

  // Notify admin
  // ... send email to admin

  ApiResponse.success(res, order, "Refund requested successfully");
});
