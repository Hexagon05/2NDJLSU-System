import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";

let auth: any;
let db: any;

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  // Validate environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing Firebase Admin SDK credentials in environment variables");
    console.error("Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
  } else {
    try {
      const serviceAccount = {
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      };

      initializeApp({
        credential: cert(serviceAccount as any),
      });

      auth = getAuth();
      db = getFirestore();
      console.log("Firebase Admin SDK initialized successfully");
    } catch (error: any) {
      console.error("Firebase Admin SDK initialization error:", error.message);
    }
  }
} else {
  auth = getAuth();
  db = getFirestore();
}

export async function POST(request: Request) {
  try {
    // Check if Firebase is initialized
    if (!auth || !db) {
      return Response.json(
        { 
          error: "Server error: Firebase Admin SDK not initialized. Please check environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY" 
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      email,
      password,
      firstName,
      lastName,
      middleInitial,
      rank,
      position,
      contactNo,
      dateOfBirth,
      currentAddress,
      permanentAddress,
      imageUrl,
    } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return Response.json(
        { error: "Missing required fields: email, password, firstName, lastName" },
        { status: 400 }
      );
    }

    console.log(`Creating personnel account for: ${email}`);

    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    console.log(`Firebase Auth user created: ${userRecord.uid}`);

    // Create user document with 'personnel' role in users collection
    await db.collection("users").doc(userRecord.uid).set({
      email,
      role: "personnel", // Mark as personnel, not admin
      displayName: `${firstName} ${lastName}`,
      uid: userRecord.uid,
      createdAt: new Date(),
    });

    console.log(`User document created for: ${userRecord.uid}`);

    // Create personnel account document
    const username = generatePersonnelId();
    await db.collection("personnelAccount").doc(userRecord.uid).set({
      firstName,
      lastName,
      middleInitial,
      rank,
      position,
      contactNo,
      email,
      dateOfBirth,
      currentAddress,
      permanentAddress,
      username,
      imageUrl: imageUrl || "",
      dateAdded: new Date().toISOString().split("T")[0],
      role: "officer",
      isActive: true,
      uid: userRecord.uid,
      createdAt: new Date(),
    });

    console.log(`Personnel account created: ${username}`);

    return Response.json({
      success: true,
      uid: userRecord.uid,
      username,
      message: "Personnel account created successfully",
    });
  } catch (error: any) {
    console.error("Error creating personnel:", error);
    console.error("Error details:", error.message);
    
    let errorMessage = error.message || "Failed to create personnel";
    
    // Handle specific Firebase errors
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Email already exists in Firebase Authentication";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Password is too weak";
    }

    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Helper function to generate personnel ID
function generatePersonnelId(): string {
  const currentYear = new Date().getFullYear();
  const yearStr = String(currentYear);
  const nextSequence = Math.floor(Math.random() * 99999) + 1;
  const sequenceStr = String(nextSequence).padStart(5, "0");
  return `${yearStr}${sequenceStr}`;
}
