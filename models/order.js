const mongoose = require("mongoose");
const { ORDER_STATUS, PAYMENT_METHODS } = require("../config/constants");

const OrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    digitalContent: {
      licenseKey: String,
      downloadUrl: String,
      activationInstructions: String,
    },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: false,
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    items: [OrderItemSchema],
    shippingAddress: {
      fullName: String,
      phoneNumber: String,
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    billingAddress: {
      fullName: String,
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      required: true,
    },
    paymentDetails: {
      transactionId: String,
      paymentIntentId: String,
      status: String,
      paidAt: Date,
    },
    pricing: {
      subtotal: {
        type: Number,
        required: true,
      },
      tax: {
        type: Number,
        default: 0,
      },
      shipping: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        required: true,
      },
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
    },
    statusHistory: [
      {
        status: String,
        date: {
          type: Date,
          default: Date.now,
        },
        note: String,
        updatedBy: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
      },
    ],
    notes: {
      customer: String,
      admin: String,
    },
    tracking: {
      carrier: String,
      trackingNumber: String,
      estimatedDelivery: Date,
      deliveredAt: Date,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
      source: String,
      couponCode: String,
    },
    refund: {
      requested: {
        type: Boolean,
        default: false,
      },
      requestedAt: Date,
      reason: String,
      amount: Number,
      processedAt: Date,
      processedBy: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ user: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ "paymentDetails.transactionId": 1 });

// Generate order number before saving
OrderSchema.pre("save", async function (next) {
  console.log('Pre-save hook running, orderNumber:', this.orderNumber);
  
  if (!this.orderNumber) {
    console.log('Generating orderNumber...');
    const count = await this.constructor.countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const orderCount = String(count + 1).padStart(6, "0");

    this.orderNumber = `ORD-${year}${month}${day}-${orderCount}`;
    console.log('Generated orderNumber:', this.orderNumber);
  }

  // Add to status history if status changed
  if (this.isModified("status")) {
    this.statusHistory.push({
      status: this.status,
      date: new Date(),
    });
  }

  next();
});

// Ensure orderNumber is set after saving
OrderSchema.post("save", function (doc) {
  console.log('Post-save hook running, orderNumber:', doc.orderNumber);
  if (!doc.orderNumber) {
    console.error('OrderNumber is still not set after save!');
  }
});

// Add validation to ensure orderNumber is set
OrderSchema.pre("validate", function (next) {
  console.log('Pre-validate hook running, orderNumber:', this.orderNumber);
  next();
});

// Method to calculate total
OrderSchema.methods.calculateTotal = function () {
  const subtotal = this.items.reduce((total, item) => {
    return total + item.price * item.quantity;
  }, 0);

  this.pricing.subtotal = subtotal;
  this.pricing.total =
    subtotal + this.pricing.tax + this.pricing.shipping - this.pricing.discount;
};

// Method to process refund
OrderSchema.methods.processRefund = async function (amount, reason, adminId) {
  this.refund = {
    requested: true,
    requestedAt: new Date(),
    reason,
    amount,
    processedAt: new Date(),
    processedBy: adminId,
  };

  this.status = ORDER_STATUS.REFUNDED;

  return this.save();
};

module.exports = mongoose.model("Order", OrderSchema);
