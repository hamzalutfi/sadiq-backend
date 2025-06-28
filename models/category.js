const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a category name"],
      unique: true,
      trim: true,
      maxLength: [100, "Category name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      url: String,
      alt: String,
    },
    parent: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      default: null,
    },
    icon: String,
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      productCount: {
        type: Number,
        default: 0,
      },
    },
    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: [String],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
CategorySchema.index({ slug: 1 });
CategorySchema.index({ parent: 1 });
CategorySchema.index({ displayOrder: 1 });

// Virtual for subcategories
CategorySchema.virtual("subcategories", {
  ref: "Category",
  localField: "_id",
  foreignField: "parent",
});

// Virtual for products
CategorySchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "category",
});

// Generate slug before saving
CategorySchema.pre("save", function (next) {
  if (!this.isModified("name")) {
    next();
  }
  this.slug = this.name
    .toLowerCase()
    .replace(/ +/g, "-");
  next();
});

// Method to get all subcategories recursively
CategorySchema.methods.getAllSubcategories = async function () {
  const subcategories = await this.model("Category").find({ parent: this._id });
  let allSubcategories = [...subcategories];

  for (const subcategory of subcategories) {
    const nestedSubcategories = await subcategory.getAllSubcategories();
    allSubcategories = [...allSubcategories, ...nestedSubcategories];
  }

  return allSubcategories;
};

module.exports = mongoose.model("Category", CategorySchema);
