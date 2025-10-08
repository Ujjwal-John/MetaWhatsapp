import express from "express";
import dotenv from "dotenv";
import { sendWhatsAppMessage } from "./controllers/whatsappController.js";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ✅ Allow your production domain + localhost for dev
app.use(cors({
  origin: [
      "http://127.0.0.1:5501",
      "http://localhost:5501",
      "https://colabesports.in",
    ],
  methods: ["GET", "POST", "OPTIONS"], // include OPTIONS for preflight
  allowedHeaders: ["Content-Type","Authorization"]
}));

app.use(express.json());

// In-memory store for received messages
let receivedMessagesStore = [];

// Route to send WhatsApp message after registration
app.post("/api/send-whatsapp", sendWhatsAppMessage);

app.get("/", (req, res) => {
  res.send("✅ WhatsApp API is running...");
});

/**
 * ✅ STEP 1: VERIFY WEBHOOK (Meta setup)
 */
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "my_verify_token"; // must match Meta setup

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

/**
 * ✅ STEP 2: RECEIVE MESSAGES (TEXT & IMAGE)
 */
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object && body.entry) {
    const messages = body.entry[0].changes[0]?.value.messages;

    if (messages) {
      for (const msg of messages) {
        const from = msg.from;
        const timestamp = new Date().toISOString();

        // CASE 1: Text message
        if (msg.text) {
          const text = msg.text.body;
          console.log(`📩 Text from ${from}: ${text}`);
          receivedMessagesStore.push({ from, text, timestamp });
        }

        // CASE 2: Image message
        if (msg.type === "image") {
          const mediaId = msg.image.id;
          console.log(`🖼 Received image with Media ID: ${mediaId}`);

          try {
            // Get media URL from WhatsApp API
            const mediaRes = await axios.get(
              `https://graph.facebook.com/v20.0/${mediaId}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                },
              }
            );

            const mediaUrl = mediaRes.data.url;

            console.log(`🔗 Media URL: ${mediaUrl}`);

           
            // Step 2: Download image (no headers)
            const imageResponse = await axios.get(mediaUrl, { responseType: "arraybuffer" });

            

            // Save image locally
            const imageName = `${Date.now()}.jpg`;
            const imagePath = path.join(uploadDir, imageName);
            fs.writeFileSync(imagePath, imageResponse.data);

            console.log(`✅ Image saved locally: ${imagePath}`);

            // Store in message array
            receivedMessagesStore.push({
              from,
              text: `[Image] ${imageName}`,
              timestamp,
            });
          } catch (err) {
            console.error("❌ Error fetching image:", err.message);
          }
        }
      }
    }

    return res.status(200).json({ status: "received" });
  }

  res.status(404).json({ error: "Invalid payload" });
});

/**
 * ✅ STEP 3: GET ALL RECEIVED MESSAGES
 */
app.get("/api/messages", (req, res) => {
  res.status(200).json({ messages: receivedMessagesStore });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port http://localhost:${PORT}`)
);
