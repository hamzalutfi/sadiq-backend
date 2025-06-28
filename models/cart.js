const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    appliedOffer: {
      type: mongoose.Schema.ObjectId,
      ref: "Offer",
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const CartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [CartItemSchema],
    couponCode: String,
    couponDiscount: {
      type: Number,
      default: 0,
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    shipping: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: Date.now,
      index: { expires: "7d" }, // Cart expires after 7 days of inactivity
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
CartSchema.index({ user: 1 });
CartSchema.index({ updatedAt: 1 });

// Calculate totals before saving
CartSchema.pre("save", function (next) {
  this.subtotal = this.items.reduce((total, item) => {
    return total + item.price * item.quantity - item.discountAmount;
  }, 0);

  // Calculate tax (example: 10%)
  this.tax = this.subtotal * 0.1;

  // Calculate total
  this.total = this.subtotal + this.tax + this.shipping - this.couponDiscount;

  // Update expiry
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  next();
});

// Method to add item to cart
CartSchema.methods.addItem = async function (productId, quantity = 1) {
  const existingItemIndex = this.items.findIndex(
    (item) => item.product.toString() === productId.toString()
  );

  if (existingItemIndex > -1) {
    this.items[existingItemIndex].quantity += quantity;
  } else {
    const Product = mongoose.model("Product");
    const product = await Product.findById(productId);

    if (!product) {
      throw new Error("Product not found");
    }

    this.items.push({
      product: productId,
      quantity,
      price: product.discountPrice || product.price,
    });
  }

  return this.save();
};

// Method to remove item from cart
CartSchema.methods.removeItem = function (productId) {
  this.items = this.items.filter(
    (item) => item.product.toString() !== productId.toString()
  );
  return this.save();
};

// Method to update item quantity
CartSchema.methods.updateItemQuantity = function (productId, quantity) {
  const item = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (item) {
    if (quantity === 0) {
      return this.removeItem(productId);
    }
    item.quantity = quantity;
    return this.save();
  }

  throw new Error("Item not found in cart");
};

// Method to clear cart
CartSchema.methods.clearCart = function () {
  this.items = [];
  this.couponCode = undefined;
  this.couponDiscount = 0;
  return this.save();
};

module.exports = mongoose.model("Cart", CartSchema);
