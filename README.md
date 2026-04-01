# Express REST API with PostgreSQL

## Overview
This project is a RESTful API built with Express.js and PostgreSQL. It provides endpoints for user management, including creating, retrieving, updating, and deleting users.

## Project Structure
```
express-rest-api
├── src
│   ├── app.js
│   ├── db
│   │   └── index.js
│   ├── controllers
│   │   └── userController.js
│   ├── routes
│   │   └── userRoutes.js
│   ├── models
│   │   └── userModel.js
│   └── middleware
│       └── errorHandler.js
├── package.json
├── .env.example
└── README.md
```

## Setup Instructions

1. **Clone the repository**
   ```
   git clone <repository-url>
   cd express-rest-api
   ```

2. **Install dependencies**
   ```
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env` and fill in the required values for your PostgreSQL database connection.

4. **Run the application**
   ```
   npm start
   ```

## API Endpoints

### User Management

- **Create User**
  - `POST /api/users`
  - Request Body: `{ "name": "John Doe", "email": "john@example.com" }`
  
- **Get User**
  - `GET /api/users/:id`
  
- **Update User**
  - `PUT /api/users/:id`
  - Request Body: `{ "name": "Jane Doe", "email": "jane@example.com" }`
  
- **Delete User**
  - `DELETE /api/users/:id`

## Usage Examples
You can use tools like Postman or curl to interact with the API endpoints.

## License
This project is licensed under the MIT License.
