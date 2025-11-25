const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./db/mongo");
const axios = require("axios");
const Request = require("./models/request");
const privilegeRoutes = require("./routes/mongo-request");

dotenv.config();

const app = express();
app.use(express.json());

// -------------------- CONFIG --------------------
const {
  BOT_TOKEN,
  CHAT_ID,
  BACKEND_CALLBACK_URL
} = process.env;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;


// -------------------- ROUTES --------------------
app.use("/", privilegeRoutes);

// -------------------- PING / ROOT --------------------
app.get("/ping", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Node forwarder online",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => res.send("Telegram bot backend running."));

// -------------------- EXPIRATION WORKER --------------------
setInterval(async () => {
  try {
    const now = new Date();
    const expiredRequests = await Request.find({
      status: "pending",
      expires_at: { $lte: now }
    });

    for (const reqItem of expiredRequests) {
      await Request.updateOne(
        { request_uuid: reqItem.request_uuid },
        { status: "expired", responded_at: now }
      );

      // Edit Telegram message
      if (reqItem.telegram_message_id) {
        await axios.post(`${TELEGRAM_API}/editMessageText`, {
          chat_id: CHAT_ID,
          message_id: reqItem.telegram_message_id,
          text: `❌ <b>Request Expired</b>\n\nThis request is no longer valid. Please submit a new one.`,
          parse_mode: "HTML"
        });
      }

      // Notify backend
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid: reqItem.request_uuid,
        status: "expired",
        responded_at: now.toISOString()
      });
    }
  } catch (err) {
    console.error("❌ Expiration worker error:", err.message);
  }
}, 60000); // every 1 min

// -------------------- CONNECT DB & START SERVER --------------------
connectDB().then(() => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Node API running on port ${port}`);
  });
});