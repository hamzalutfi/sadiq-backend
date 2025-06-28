# Sadiq Backend

## Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sadiq-store

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30

# File Upload Configuration
MAX_FILE_UPLOAD=5000000
FILE_UPLOAD_PATH=public/uploads

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Email Configuration (if using email features)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@sadiqstore.com
FROM_NAME=Sadiq Store
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create the `.env` file with the variables above

3. Start the server:
```bash
npm start
```

## File Upload Configuration

The backend is configured to handle file uploads with the following settings:
- Maximum file size: 5MB (configurable via MAX_FILE_UPLOAD)
- Upload directory: public/uploads (configurable via FILE_UPLOAD_PATH)
- Allowed file types: Images only (JPEG, PNG, WebP, etc.)

## API Endpoints

- Authentication: `/api/v1/auth`
- Products: `/api/v1/products`
- Categories: `/api/v1/categories`
- Users: `/api/v1/users`
- Cart: `/api/v1/cart`
- Orders: `/api/v1/orders`
- Admin: `/api/v1/admin`
- Offers: `/api/v1/offers`
- Analytics: `/api/v1/analytics` 