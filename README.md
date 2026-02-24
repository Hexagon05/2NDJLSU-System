# Log Truck - Logistics Support Unit

A modern vehicle tracking and logistics management system built with Next.js, Tailwind CSS, and Firebase authentication.

## Features

- **Authentication**: Firebase-based email and password authentication
- **Dashboard**: Real-time vehicle tracking and live activity monitoring
- **Responsive Design**: Mobile-friendly UI built with Tailwind CSS
- **Real-Time Updates**: Live vehicle status and logistics tracking
- **User Management**: Admin user interface for managing logistics operations

## Tech Stack

- **Frontend**: Next.js 16.1 with TypeScript
- **Styling**: Tailwind CSS 3.4
- **Authentication**: Firebase Auth
- **Database**: Firebase Realtime Database
- **Package Manager**: npm

## Project Structure

```
.
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Root page (redirects to login)
│   ├── globals.css             # Global styles
│   ├── login/
│   │   └── page.tsx            # Login page
│   └── dashboard/
│       └── page.tsx            # Dashboard page
├── components/
│   └── LoginForm.tsx           # Login form component
├── lib/
│   ├── firebase.ts             # Firebase configuration
│   └── auth-context.tsx        # Authentication context provider
├── public/                      # Static assets
├── package.json                # Project dependencies
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
└── next.config.js              # Next.js configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase account with project setup

### Installation

1. Install dependencies:
```bash
npm install
```

2. The Firebase configuration is already set up in `lib/firebase.ts`

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The application will:
- Redirect unauthenticated users to the login page
- Show the dashboard for authenticated users
- Automatically redirect from root page based on auth state

## Authentication

The application uses Firebase Authentication with email and password. Users will:

1. Enter their email and password on the login page
2. Get validated against Firebase credentials
3. Be redirected to the dashboard upon successful login
4. Have access to logout functionality in the dashboard

### Firebase Configuration

The Firebase config is in `lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyBjpuulrhwB0grjAtPshv0l_I6owSF7Q4k",
  authDomain: "lsu-tracker.firebaseapp.com",
  projectId: "lsu-tracker",
  storageBucket: "lsu-tracker.firebasestorage.app",
  messagingSenderId: "68027606603",
  appId: "1:68027606603:web:064b8602a33d552ee08fce",
  measurementId: "G-CJT9KBT9GR"
};
```

## Pages

### Login Page (`/login`)

- Email and password input fields
- Show/hide password toggle
- Error message display
- Loading state during authentication
- "Don't have an Account?" link placeholder
- AFDLSC branding and styling

### Dashboard (`/dashboard`)

- Real-time vehicle tracking map (placeholder)
- Live activity log
- Metrics display:
  - Total Active Vehicles
  - Ongoing Deliveries
  - Completed Supplies
  - Emergency Alerts
- Sidebar navigation
- User profile and logout functionality

## Building for Production

```bash
npm run build
npm start
```

## Styling

The project uses Tailwind CSS with a custom configuration. All components use Tailwind utility classes for styling.

### Color Scheme

- Primary: Blue (600-700)
- Success: Green
- Warning: Yellow
- Danger: Red
- Backgrounds: Gray, Green-50

## Deployment

This Next.js application can be deployed to:
- Vercel (recommended)
- AWS Amplify
- Firebase Hosting
- Any Node.js hosting provider

## Error Handling

The login form includes comprehensive error handling:
- User not found
- Wrong password
- Invalid email format
- Disabled accounts
- Network errors

## Future Enhancements

- Vehicle tracking map integration
- Real-time database for vehicle status
- Officer management interface
- Trip history and analytics
- Push notifications
- Mobile app version

## License

APFLSC 2025 - Logistics Support Unit, Palawan

## Support

For issues or questions, please contact the development team.
