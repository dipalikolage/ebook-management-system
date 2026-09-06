# Ebooks App - Improved Version

## Run locally

1. Install Node.js LTS.
2. Make sure MongoDB is running locally.
3. Open this folder in PowerShell/VS Code.
4. Install dependencies:
   `npm install`
5. Create `.env` from `.env.example` and change `SESSION_SECRET` and admin credentials.
6. Start in development mode:
   `npm run dev`
   Or production-style:
   `npm start`
7. Open `http://localhost:2300`.

## Important

- `node_modules` is intentionally not included. Run `npm install` after extracting the project.
- Existing plain-text passwords are supported once for migration. After a successful login, the password is automatically replaced with a bcrypt hash.
- Book images can now be uploaded from the admin Add Book page.
- The cart is now separated by logged-in user.


### Checkout
Users can add books to their cart, review a checkout summary, place an order, and view their order history. Admins can view placed orders with buyer name, email, items, total, status, and order date.

### Razorpay payments

- Checkout creates a Razorpay order on the server in INR and opens Razorpay Standard Checkout.
- The cart is cleared only after the server verifies the Razorpay signature and validates the payment/order amount.
- Successful payments are stored with Razorpay order/payment IDs and marked `Paid`.
- Failed or dismissed payments are stored as `Payment Failed`; the cart is retained so the customer can try again.
- Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env`. Use Razorpay Test Mode keys while developing.
