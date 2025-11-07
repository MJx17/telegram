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

app.post("/send-request", async (req, res) => {
  try {
    const {
      request_uuid,
      requestor_fullname,
      system_name,
      type,
      reason,
      requested_at,
    } = req.body;

    // 🧩 1️⃣ Save to MongoDB
    const newRequest = await Request.create({
      request_uuid,
      requestor_fullname,
      system_name,
      type,
      reason,
      requested_at,
    });

    // 🧠 2️⃣ Prepare Telegram message text
    const text = `
🔐 <b>Privilege Access Request</b>

👤 <b>Full Name:</b> ${requestor_fullname}
🖥️ <b>System:</b> ${system_name}
📂 <b>Type:</b> ${type}
📝 <b>Reason:</b> ${reason}
⏰ <b>Requested At:</b> ${requested_at}
`;

    // 📨 3️⃣ Telegram payload
    const payload = {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${request_uuid}` },
            { text: "❌ Decline", callback_data: `decline:${request_uuid}` },
          ],
        ],
      },
    };

    // 🚀 4️⃣ Send to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);

    // ✅ 5️⃣ Respond success
    res.status(200).json({
      status: "ok",
      message: "Request sent and saved successfully.",
      data: newRequest,
    });
  } catch (err) {
    console.error("❌ Error in /send-request:", err.message);

    res.status(500).json({
      status: "error",
      message: "Failed to send or save request.",
      error: err.message,
    });
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

      const decision = decisionRaw === "approve" ? "approved" : "declined";
      const emoji = decision === "approved" ? "✅" : "❌";

      // 1️⃣ Acknowledge the button click
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `You ${decision}`,
      });

      // 2️⃣ Update the Telegram message
      const editedText = `${query.message.text}\n\n${emoji} <b>Decision:</b> ${decision.toUpperCase()} by @${approver}`;
      await axios.post(`${TELEGRAM_API}/editMessageText`, {
        chat_id,
        message_id,
        text: editedText,
        parse_mode: "HTML",
      });

      // 3️⃣ Update MongoDB record
      await Request.findOneAndUpdate(
        { request_uuid },
        {
          decision,
          approver,
          responded_at: new Date(),
        },
        { new: true }
      );

      // 4️⃣ Optional backend callback
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid,
        decision,
        approver,
        responded_at: new Date().toISOString(),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
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