const express = require("express");
const axios = require("axios");
const connectDB = require("./db");
const Request = require("./request");
const app = express();
const dotenv = require("dotenv");
dotenv.config();

app.use(express.json());

// -------------------- CONFIG --------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const BACKEND_CALLBACK_URL = process.env.BACKEND_CALLBACK_URL;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const EXPIRE_MINUTES = 15; // Expiration time

// -------------------- SEND REQUEST --------------------
app.post("/send-request", async (req, res) => {
  try {
    const {
      request_uuid,
      requestor_fullname,
      login_fullname,
      system_name,
      type,
      reason,
      timestamp,
    } = req.body;


    const requestedAt = timestamp ? new Date(timestamp) : new Date();
    const expires_at = new Date(new Date(requestedAt).getTime() + EXPIRE_MINUTES * 60000);
    // Save to MongoDB
    const newRequest = await Request.create({
      request_uuid,
      requestor_fullname,
      login_fullname,
      system_name,
      type,
      reason,
      requested_at: requestedAt,
      decision: "pending",
      expires_at,
    });

    // Build Telegram message
    const text = `
🔐 <b>Privilege Access Request</b>

👤 <b>Requestor:</b> ${requestor_fullname}
🔑 <b>Login Fullname:</b> ${login_fullname ?? "N/A"}
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
            { text: "❌ Decline", callback_data: `decline:${request_uuid}` },
          ],
        ],
      },
    };

    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);

    res.status(200).json({
      status: "ok",
      message: "Forwarded and saved.",
      data: newRequest,
    });
  } catch (err) {
    console.error("❌ Error in /send-request:", err.message);
    res.status(500).json({
      status: "error",
      message: "Forwarding failed.",
      error: err.message,
    });
  }
});

// -------------------- TELEGRAM WEBHOOK --------------------
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    if (update.callback_query) {
      const query = update.callback_query;
      const [decisionRaw, request_uuid] = query.data.split(":");
      const chat_id = query.message.chat.id;
      const message_id = query.message.message_id;

      // Fetch request from MongoDB
      const existing = await Request.findOne({ request_uuid });
      const now = new Date();

      if (!existing) {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: query.id,
          text: "Request not found.",
        });
        return res.sendStatus(200);
      }

      if (existing.decision !== "pending" || (existing.expires_at && existing.expires_at <= now)) {
        // Already responded or expired
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: query.id,
          text: "⏳ This request has expired or already been responded to.",
        });

        // Mark as expired if still pending
        if (existing.decision === "pending") {
          await Request.updateOne(
            { request_uuid },
            { decision: "expired", responded_at: now }
          );
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id,
            message_id,
            text: `❌ <b>Request Expired</b>\n\nThis request is no longer valid. Please submit a new one.`,
            parse_mode: "HTML",
          });
        }

        return res.sendStatus(200);
      }

      // Extract approver info
      const firstName = query.from.first_name || "";
      const lastName = query.from.last_name || "";
      const username = query.from.username ? `@${query.from.username}` : "";
      const fullName = `${firstName} ${lastName}`.trim();
      const approverDisplay = fullName || username || "Unknown";

      const decision = decisionRaw === "approve" ? "approved" : "declined";
      const emoji = decision === "approved" ? "✅" : "❌";

      // Acknowledge button
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `You ${decision}`,
      });

      // Edit Telegram message
      const editedText = `${query.message.text}\n\n${emoji} <b>Decision:</b> ${decision.toUpperCase()} by ${approverDisplay}`;
      await axios.post(`${TELEGRAM_API}/editMessageText`, {
        chat_id,
        message_id,
        text: editedText,
        parse_mode: "HTML",
      });

      // Update MongoDB
      await Request.findOneAndUpdate(
        { request_uuid },
        {
          decision,
          approver_username: username || null,
          approver_fullname: fullName || null,
          approver_display: approverDisplay,
          responded_at: now,
        },
        { new: true }
      );

      // Callback to main backend
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid,
        decision,
        approver_fullname: fullName,
        approver_username: username,
        responded_at: now.toISOString(),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// -------------------- SET TELEGRAM WEBHOOK --------------------
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

// -------------------- TEST SEND --------------------
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

// -------------------- PING --------------------
app.get("/ping", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Node forwarder online",
    timestamp: new Date().toISOString(),
  });
});

// -------------------- ROOT --------------------
app.get("/", (req, res) => res.send("Telegram bot backend running."));

// -------------------- EXPIRATION WORKER --------------------
setInterval(async () => {
  try {
    const now = new Date();
    const expiredRequests = await Request.find({
      decision: "pending",
      expires_at: { $lte: now },
    });

    for (const reqItem of expiredRequests) {
      await Request.updateOne(
        { request_uuid: reqItem.request_uuid },
        { decision: "expired", responded_at: now }
      );

      // Edit Telegram message
      await axios.post(`${TELEGRAM_API}/editMessageText`, {
        chat_id: CHAT_ID,
        message_id: reqItem.telegram_message_id, // store message_id when sending
        text: `❌ <b>Request Expired</b>\n\nThis request is no longer valid. Please submit a new one.`,
        parse_mode: "HTML",
      });

      // Notify main backend
      await axios.post(BACKEND_CALLBACK_URL, {
        request_uuid: reqItem.request_uuid,
        decision: "expired",
        responded_at: now.toISOString(),
      });
    }
  } catch (err) {
    console.error("❌ Expiration worker error:", err.message);
  }
}, 60000); // Runs every 1 minute

// -------------------- CONNECT DB & START --------------------
connectDB().then(() => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Node test API running on port ${port}`);
  });
});
