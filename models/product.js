const mongoose = require("mongoose");
const { PRODUCT_TYPES } = require("../config/constants");

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a product name"],
      trim: true,
      maxLength: [200, "Product name cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Please provide a product description"],
      maxLength: [2000, "Description cannot exceed 2000 characters"],
    },
    price: {
      type: Number,
      required: [true, "Please provide a product price"],
      min: [0, "Price cannot be negative"],
    },
    availability: {
      type: String,
      default: 'متوفر'
    },
    discountPrice: {
      type: Number,
      min: [0, "Discount price cannot be negative"],
    },
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: [true, "Please provide a category"],
    },
    productType: {
      type: String,
      // enum: Object.values(PRODUCT_TYPES),
      required: [true, "Please specify product type"],
    },
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        alt: String,
        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],
    features: [String],
    specifications: {
      type: Map,
      of: String,
    },
    digitalContent: {
      // For digital products like keys, licenses
      deliveryMethod: {
        type: String,
        enum: ["email", "instant", "manual"],
        default: "email",
      },
      activationInstructions: String,
      licenseKey: {
        type: String,
        select: false, // Hidden by default for security
      },
      downloadUrl: {
        type: String,
        select: false,
      },
      expiryDate: Date,
    },
    inventory: {
      quantity: {
        type: Number,
        default: 0,
        // min: [0, "Quantity cannot be negative"],
      },
      trackInventory: {
        type: Boolean,
        default: true,
      },
      allowBackorder: {
        type: Boolean,
        default: true,
      },
    },
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: [0, "Rating cannot be less than 0"],
        max: [5, "Rating cannot be more than 5"],
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    metadata: {
      views: {
        type: Number,
        default: 0,
      },
      purchases: {
        type: Number,
        default: 0,
      },
      tags: [String],
      brand: String,
      sku: {
        type: String,
        unique: true,
        sparse: true,
      },
    },
    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: [String],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
ProductSchema.index({ name: "text", description: "text" });
ProductSchema.index({ slug: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ "ratings.average": -1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ isActive: 1, isFeatured: 1 });

// Virtual for reviews
ProductSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "product",
  justOne: false,
});

// Method to check if product is in stock
ProductSchema.methods.isInStock = function () {
  return (
    !this.inventory.trackInventory ||
    this.inventory.quantity > 0 ||
    this.inventory.allowBackorder
  );
};

// Method to decrease quantity
ProductSchema.methods.decreaseQuantity = async function (quantity) {
  if (this.inventory.trackInventory) {
    this.inventory.quantity -= quantity;
    // if (this.inventory.quantity < 0 && !this.inventory.allowBackorder) {
    //   throw new Error("Insufficient inventory");
    // }
    await this.save();
  }
};

// Static method to generate unique slug
ProductSchema.statics.generateUniqueSlug = async function (name) {
  if (!name || typeof name !== 'string') {
    return `product-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!baseSlug) {
    return `product-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  let slug = baseSlug;
  let counter = 1;

  while (await this.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;

    if (counter > 1000) {
      slug = `${baseSlug}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      break;
    }
  }

  return slug;
};

module.exports = mongoose.model("Product", ProductSchema);
