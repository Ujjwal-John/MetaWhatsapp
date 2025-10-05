import express from "express";
import dotenv from "dotenv";
import { sendWhatsAppMessage } from "./controllers/whatsappController.js";

dotenv.config();
const app = express();
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
  const VERIFY_TOKEN = "my_verify_token"; // choose any string, must match Meta setup

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
 * ✅ STEP 2: RECEIVE MESSAGES
 */
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object && body.entry) {
    const messages = body.entry[0].changes[0]?.value.messages;
    if (messages) {
      messages.forEach((msg) => {
        const from = msg.from;
        const text = msg.text?.body || "No text message";

        const messageObj = {
          from,
          text,
          timestamp: new Date().toISOString(),
        };

        console.log(`📩 New message from ${from}: ${text}`);
        receivedMessagesStore.push(messageObj); // store for later retrieval
      });
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
app.listen(PORT,"0.0.0.0", () => console.log(`🚀 Server running on port http://localhost:${PORT}`));

