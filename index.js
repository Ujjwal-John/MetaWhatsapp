import express from "express";
import dotenv from "dotenv";
import { sendWhatsAppMessage } from "./controllers/whatsappController.js";

dotenv.config();
const app = express();
app.use(express.json());

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

  // Check this is from a WhatsApp message
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // WhatsApp number of the user
      const msgBody = message.text?.body || "No text message";

      console.log(`📩 New message from ${from}: ${msgBody}`);
    }

    res.sendStatus(200); // acknowledge receipt
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port http://localhost:${PORT}`));

