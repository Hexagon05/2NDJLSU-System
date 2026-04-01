import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      } as any),
    });
  }

  return getFirestore();
}

export async function POST(_request: Request) {
  try {
    const db = getDb();
    if (!db) {
      return Response.json(
        {
          success: false,
          error: "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in environment variables.",
        },
        { status: 500 }
      );
    }

    const dispatchesRef = db.collection("dispatches");
    
    // Find all documents with misspelled status
    const snapshot = await dispatchesRef
      .where("status", "==", "Sucessful Dispatch")
      .get();

    if (snapshot.empty) {
      return Response.json({
        success: true,
        message: "No documents with misspelled status found.",
        updated: 0,
      });
    }

    // Batch update all misspelled documents
    const batch = db.batch();
    let updateCount = 0;

    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: "Successful Dispatch",
      });
      updateCount++;
    });

    await batch.commit();

    return Response.json({
      success: true,
      message: `Successfully updated ${updateCount} dispatch(es) from "Sucessful Dispatch" to "Successful Dispatch"`,
      updated: updateCount,
    });
  } catch (error: any) {
    console.error("Error fixing spelling:", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Failed to update documents",
      },
      { status: 500 }
    );
  }
}
