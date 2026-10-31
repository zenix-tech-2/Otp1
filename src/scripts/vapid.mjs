// Generates the key pair for web push. Run: node scripts/vapid.mjs  → copy the three lines into your environment variables.
import { createECDH } from "node:crypto";
const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString("base64url")}`);
console.log("VAPID_SUBJECT=mailto:you@yourdomain.com");
