const mongoose = require("mongoose");
const { OFFER_TYPES } = require("../config/constants");

const OfferSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide an offer name"],
      trim: true,
      maxLength: [100, "Offer name cannot exceed 100 characters"],
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      required: [true, "Please provide an offer code"],
    },
    description: {
      type: String,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: Object.values(OFFER_TYPES),
      required: [true, "Please specify offer type"],
    },
    value: {
      type: Number,
      required: [true, "Please provide offer value"],
      min: [0, "Value cannot be negative"],
    },
    minimumPurchase: {
      type: Number,
      default: 0,
      min: [0, "Minimum purchase cannot be negative"],
    },
    maximumDiscount: {
      type: Number,
      min: [0, "Maximum discount cannot be negative"],
    },
    applicableProducts: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Product",
      },
    ],
    applicableCategories: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Category",
      },
    ],
    excludedProducts: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Product",
      },
    ],
    usageLimit: {
      perUser: {
        type: Number,
        default: 1,
      },
      total: {
        type: Number,
        default: null,
      },
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    validity: {
      startDate: {
        type: Date,
        required: [true, "Please provide start date"],
      },
      endDate: {
        type: Date,
        required: [true, "Please provide end date"],
      },
    },
    conditions: {
      newUsersOnly: {
        type: Boolean,
        default: false,
      },
      specificUsers: [
        {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
      ],
      firstPurchase: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      usedBy: [
        {
          user: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
          },
          usedAt: Date,
          orderId: {
            type: mongoose.Schema.ObjectId,
            ref: "Order",
          },
        },
      ],
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
OfferSchema.index({ code: 1 });
OfferSchema.index({ "validity.startDate": 1, "validity.endDate": 1 });
OfferSchema.index({ isActive: 1 });
OfferSchema.index({ type: 1 });

// Validate dates
OfferSchema.pre("save", function (next) {
  if (this.validity.endDate <= this.validity.startDate) {
    return next(new Error("End date must be after start date"));
  }
  next();
});

// Method to check if offer is valid
OfferSchema.methods.isValid = function () {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.validity.startDate &&
    now <= this.validity.endDate &&
    (this.usageLimit.total === null || this.usageCount < this.usageLimit.total)
  );
};

// Method to check if user can use offer
OfferSchema.methods.canUserUse = function (userId) {
  if (!this.isValid()) return false;

  const userUsageCount = this.metadata.usedBy.filter(
    (usage) => usage.user.toString() === userId.toString()
  ).length;

  return userUsageCount < this.usageLimit.perUser;
};

// Method to apply offer
OfferSchema.methods.applyOffer = function (amount) {
  if (amount < this.minimumPurchase) {
    return 0;
  }

  let discount = 0;

  switch (this.type) {
    case OFFER_TYPES.PERCENTAGE:
      discount = amount * (this.value / 100);
      break;
    case OFFER_TYPES.FIXED_AMOUNT:
      discount = this.value;
      break;
    case OFFER_TYPES.BUY_ONE_GET_ONE:
      // Implement BOGO logic based on products
      discount = amount / 2;
      break;
    case OFFER_TYPES.FREE_SHIPPING:
      // Return shipping cost
      discount = 0; // Will be handled separately
      break;
  }

  if (this.maximumDiscount && discount > this.maximumDiscount) {
    discount = this.maximumDiscount;
  }

  return Math.min(discount, amount);
};

module.exports = mongoose.model("Offer", OfferSchema);
