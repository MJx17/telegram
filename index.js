const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🧠 Config
const BOT_TOKEN = "7568206820:AAEoTmRSaPvGffcJ1y9HT4l26M18a5SoPSA";
const CHAT_ID = "YOUR_CHAT_ID";
const BACKEND_CALLBACK_URL = "https://your-backend-domain.com/api/privilege/decision";
const WEBHOOK_URL = "https://your-public-domain.com/telegram-webhook"; // Set this to your hosted URL

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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
    res.status(500).json({ error: err.message });
  }
});

// 💬 Telegram webhook
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    if (update.callback_query) {
      const query = update.callback_query;
      const [decision, request_uuid] = query.data.split(":");
      const chat_id = query.message.chat.id;
      const message_id = query.message.message_id;
      const approver = query.from.username || query.from.first_name;

      // 1️⃣ Answer callback
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `You chose to ${decision.toUpperCase()}`
      });

      // 2️⃣ Edit original message
      const editedText = `${query.message.text}\n\n✅ <b>Decision:</b> ${decision.toUpperCase()} by @${approver}`;
      await axios.post(`${TELEGRAM_API}/editMessageText`, {
        chat_id,
        message_id,
        text: editedText,
        parse_mode: "HTML"
      });

      // 3️⃣ Call your backend
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid,
        decision,
        approver,
        responded_at: new Date().toISOString()
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

// ✅ Health check
app.get("/", (req, res) => res.send("Telegram bot backend running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
