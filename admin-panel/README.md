# VeeFore Admin Panel

A comprehensive, enterprise-grade admin panel for the VeeFore SaaS platform built with React, TypeScript, Node.js, and MongoDB.

## 🚀 Features

### Core Functionality
- **Admin Authentication** - JWT-based auth with 2FA support
- **Role-Based Access Control** - Granular permissions system
- **User Management** - Complete user lifecycle management
- **Refund Management** - Automated and manual refund processing
- **Subscription Management** - Plan and billing management
- **Support Tickets** - Integrated ticketing system
- **Analytics Dashboard** - Comprehensive metrics and insights
- **Audit Logging** - Complete activity tracking
- **Coupon System** - Advanced discount management

### Security Features
- **Two-Factor Authentication** - TOTP-based 2FA
- **IP Whitelisting** - Enhanced security controls
- **Device Fingerprinting** - Track admin sessions
- **Audit Trails** - Complete action logging
- **Rate Limiting** - API protection
- **Data Encryption** - Sensitive data protection

### Advanced Features
- **Real-time Updates** - WebSocket integration
- **Bulk Operations** - Efficient data management
- **Export/Import** - Data portability
- **Webhook Management** - External integrations
- **Maintenance Mode** - System control
- **Multi-language Support** - Internationalization

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Socket.io** - Real-time communication
- **Winston** - Logging
- **Nodemailer** - Email service

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Query** - Data fetching
- **React Router** - Navigation
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 5.0+
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd admin-panel
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Database Setup**
   ```bash
   # Start MongoDB
   mongod
   
   # The app will create necessary collections on first run
   ```

5. **Start Development Server**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start individually
   npm run server:dev  # Backend only
   npm run client:dev  # Frontend only
   ```

6. **Access the Application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:5001/api
   - Health Check: http://localhost:5001/api/health

## 🔧 Configuration

### Environment Variables

Key environment variables to configure:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/veefore-admin

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
```

### Database Schema

The admin panel uses the following main collections:
- `admins` - Admin user accounts
- `roles` - Role definitions and permissions
- `admininvites` - Pending admin invitations
- `auditlogs` - System activity logs
- `users` - End user accounts

## 🏗️ Project Structure

```
admin-panel/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts
│   │   ├── services/      # API services
│   │   └── utils/         # Utility functions
│   └── public/            # Static assets
├── server/                # Node.js backend
│   ├── controllers/       # Route controllers
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── middleware/       # Express middleware
│   ├── services/         # Business logic
│   └── utils/            # Utility functions
├── logs/                 # Application logs
└── uploads/              # File uploads
```

## 🔐 Security

### Authentication Flow
1. Admin enters credentials
2. Server validates and returns JWT token
3. Token stored in localStorage
4. All API requests include token in Authorization header
5. Server validates token on each request

### Permission System
- **Roles**: superadmin, admin, support, billing, etc.
- **Levels**: 1-5 hierarchy system
- **Teams**: executive, support, billing, product, etc.
- **Permissions**: Granular access control

### Data Protection
- Password hashing with bcrypt
- JWT token expiration
- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection prevention
- XSS protection

## 📊 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - Admin login
- `POST /api/auth/logout` - Admin logout
- `GET /api/auth/profile` - Get admin profile
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/setup-2fa` - Setup 2FA
- `POST /api/auth/verify-2fa` - Verify 2FA

### Admin Management
- `GET /api/admin` - List admins
- `POST /api/admin` - Create admin
- `PUT /api/admin/:id` - Update admin
- `DELETE /api/admin/:id` - Delete admin

### User Management
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user
- `POST /api/users/:id/ban` - Ban user

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Docker Deployment
```bash
# Build image
docker build -t veefore-admin-panel .

# Run container
docker run -p 5001:5001 veefore-admin-panel
```

### Environment Setup
1. Set production environment variables
2. Configure MongoDB Atlas connection
3. Set up email service (SendGrid, AWS SES, etc.)
4. Configure Redis for sessions
5. Set up monitoring and logging

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run e2e tests
npm run test:e2e
```

## 📈 Monitoring

### Health Checks
- API health: `/api/health`
- Database connectivity
- External service status

### Logging
- Application logs in `./logs/`
- Error tracking with Winston
- Audit logs for compliance

### Metrics
- Request/response times
- Error rates
- User activity
- System performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Email: support@veefore.com
- Documentation: [docs.veefore.com](https://docs.veefore.com)
- Issues: GitHub Issues

## 🔄 Changelog

### v1.0.0
- Initial release
- Core admin functionality
- Authentication system
- Basic CRUD operations
- Dashboard interface

---

**VeeFore Admin Panel** - Enterprise-grade admin management for your SaaS platform.
