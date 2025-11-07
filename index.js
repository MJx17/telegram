const express = require("express");
const axios = require("axios");
const connectDB = require("./db");
const app = express();

app.use(express.json());
const dotenv = require("dotenv");
dotenv.config();

// 🧠 Config
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const BACKEND_CALLBACK_URL = process.env.BACKEND_CALLBACK_URL;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const Request = require("./request");

// 📨 Send approval request
app.post("/send-request", async (req, res) => {
  try {
    const {
      request_uuid,
      requestor_fullname,
      system_name,
      type,
      reason,
      requested_at
    } = req.body;

    const text = `
🔐 <b>Privilege Access Request</b>

👤 <b>Full Name:</b> ${requestor_fullname}
🖥️ <b>System:</b> ${system_name}
📂 <b>Type:</b> ${type}
📝 <b>Reason:</b> ${reason}
⏰ <b>Requested At:</b> ${requested_at}
`;

    const payload = {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${request_uuid}` },
            { text: "❌ Decline", callback_data: `decline:${request_uuid}` }
          ]
        ]
      }
    };

    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Error sending Telegram message:", err.message);
    console.log("BOT_TOKEN loaded:", !!BOT_TOKEN);
    console.log("CHAT_ID loaded:", CHAT_ID);
    res.status(500).json({ error: err.message });
  }
});

// 💬 Telegram webhook
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    if (update.callback_query) {
      const query = update.callback_query;
      const [decisionRaw, request_uuid] = query.data.split(":");
      const chat_id = query.message.chat.id;
      const message_id = query.message.message_id;
      const approver = query.from.username || query.from.first_name;

      // 🔤 Convert to past tense for DB and message
      const decision =
        decisionRaw === "approve" ? "approved" : "declined";
      const emoji = decision === "approved" ? "✅" : "❌";

      // 1️⃣ Answer callback
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `You ${decision}`,
      });

      // 2️⃣ Edit Telegram message
      const editedText = `${query.message.text}\n\n${emoji} <b>Decision:</b> ${decision.toUpperCase()} by @${approver}`;
      await axios.post(`${TELEGRAM_API}/editMessageText`, {
        chat_id,
        message_id,
        text: editedText,
        parse_mode: "HTML",
      });

      // 3️⃣ Update DB
      await Request.findOneAndUpdate(
        { request_uuid },
        {
          decision, // now saves "approved" or "declined"
          approver,
          responded_at: new Date(),
        },
        { new: true }
      );

      // 4️⃣ Optional callback to your backend
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid,
        decision,
        approver,
        responded_at: new Date().toISOString(),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(500);
  }
});
// 🧩 Set webhook (run once)
app.get("/set-webhook", async (req, res) => {
  try {
    const resp = await axios.get(
      `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`
    );
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/test-send", async (req, res) => {
  try {
    const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: "Hello 👋 from /test-send",
    });
    res.json(resp.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// ✅ Health check
app.get("/", (req, res) => res.send("Telegram bot backend running."));

connectDB().then(() => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Node test API running on port ${port}`);
  });
});