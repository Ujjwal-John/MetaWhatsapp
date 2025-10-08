import express from "express";
import dotenv from "dotenv";
import { sendWhatsAppMessage } from "./controllers/whatsappController.js";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();
const app = express();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder exists (optional)
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// CORS setup
app.use(cors({
  origin: [
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "https://colabesports.in",
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
}));

app.use(express.json());

// In-memory store
let receivedMessagesStore = [];

// Send WhatsApp message route
app.post("/api/send-whatsapp", sendWhatsAppMessage);

// Root route
app.get("/", (req, res) => res.send("✅ WhatsApp API is running..."));

/**
 * STEP 1: VERIFY WEBHOOK
 */
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "my_verify_token";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

/**
 * STEP 2: RECEIVE MESSAGES
 */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!(body.object && body.entry)) {
      return res.status(404).json({ error: "Invalid payload" });
    }

    const messages = body.entry[0].changes[0]?.value.messages;
    if (!messages) return res.status(200).json({ status: "no messages" });

    for (const msg of messages) {
      const from = msg.from;
      const timestamp = new Date().toISOString();

      // TEXT MESSAGE
      if (msg.text?.body) {
        const text = msg.text.body;
        console.log(`📩 Text from ${from}: ${text}`);
        receivedMessagesStore.push({ from, text, timestamp });
      }

      // IMAGE MESSAGE
      if (msg.image?.id) {
        const mediaId = msg.image.id;
        console.log(`🖼 Received image with Media ID: ${mediaId}`);

        try {
          // Step 1: Get media metadata (URL)
          const mediaRes = await axios.get(
            `https://graph.facebook.com/v20.0/${mediaId}`,
            {
              headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
            }
          );
          const mediaUrl = mediaRes.data.url;

          // Step 2: Download image as buffer
          const imageResponse = await axios.get(mediaUrl, {
            responseType: "arraybuffer",
            headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
          });

          // Step 3: Upload to Cloudinary
          const uploadedImage = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "whatsapp_media" },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(imageResponse.data);
          });

          console.log(`✅ Image uploaded to Cloudinary: ${uploadedImage.secure_url}`);

          receivedMessagesStore.push({
            from,
            text: `[Image] ${uploadedImage.secure_url}`,
            timestamp,
            mediaId,
            cloudinary_id: uploadedImage.public_id,
          });

        } catch (err) {
          console.error("❌ Error uploading image:", err.message);
        }
      }
    }

    res.status(200).json({ status: "received" });

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * STEP 3: GET ALL RECEIVED MESSAGES
 */
app.get("/api/messages", (req, res) => {
  res.status(200).json({ messages: receivedMessagesStore });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port http://localhost:${PORT}`)
);
