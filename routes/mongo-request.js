const express = require("express");
const axios = require("axios");
const Request = require("../models/Request");
const router = express.Router();

const EXPIRE_MINUTES = 15;
const { BOT_TOKEN, CHAT_ID, BACKEND_CALLBACK_URL, WEBHOOK_URL } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`; // declared here

// Helper – build Telegram message
function buildTelegramMessage(r) {
  return `
🔐 <b>Privilege Access Request</b>

👤 <b>Requestor:</b> ${r.requestor_fullname}
🔑 <b>Login Fullname:</b> ${r.login_fullname || "N/A"}
🖥️ <b>System:</b> ${r.system_name}
📂 <b>Type:</b> ${r.type}
📝 <b>Reason:</b> ${r.reason}
⏰ <b>Requested At:</b> ${r.requested_at}
`;
}

/* -------------------- SEND REQUEST -------------------- */
router.post("/send-request", async (req, res) => {
  try {
    const { request_uuid, requestor_fullname, login_fullname, system_name, type, reason, timestamp } = req.body;
    const requested_at = timestamp ? new Date(timestamp) : new Date();
    const expires_at = new Date(requested_at.getTime() + EXPIRE_MINUTES * 60000);

    const newRequest = await Request.create({
      request_uuid,
      requestor_fullname,
      login_fullname,
      system_name,
      type,
      reason,
      requested_at,
      expires_at,
      status: "pending"
    });

    const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: buildTelegramMessage(newRequest),
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${request_uuid}` },
            { text: "❌ Decline", callback_data: `decline:${request_uuid}` }
          ]
        ]
      }
    });

    newRequest.telegram_message_id = resp.data.result.message_id;
    await newRequest.save();

    res.json({ status: "ok", message: "Forwarded and saved.", data: newRequest });
  } catch (err) {
    console.error("send-request error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- TELEGRAM WEBHOOK -------------------- */
router.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;
    if (!update.callback_query) return res.sendStatus(200);

    const q = update.callback_query;
    const [action, request_uuid] = q.data.split(":");
    const chat_id = q.message.chat.id;
    const message_id = q.message.message_id;
    const existing = await Request.findOne({ request_uuid });
    const now = new Date();

    if (!existing) {
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: q.id, text: "Request not found." });
      return res.sendStatus(200);
    }

    if (existing.status !== "pending" || existing.expires_at <= now) {
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: q.id, text: "⏳ Request expired or already responded." });
      if (existing.status === "pending") {
        await Request.updateOne({ request_uuid }, { status: "expired", responded_at: now });
        await axios.post(`${TELEGRAM_API}/editMessageText`, { chat_id, message_id, parse_mode: "HTML", text: `❌ <b>Request Expired</b>\n\nThis request is no longer valid.` });
      }
      return res.sendStatus(200);
    }

    const fullName = `${q.from.first_name || ""} ${q.from.last_name || ""}`.trim();
    const username = q.from.username ? `@${q.from.username}` : "";
    const approverDisplay = fullName || username || "Unknown";
    const status = action === "approve" ? "approved" : "declined";
    const emoji = status === "approved" ? "✅" : "❌";

    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: q.id, text: `You ${status}` });
    const editedText = `${q.message.text}\n\n${emoji} <b>Status:</b> ${status.toUpperCase()} by ${approverDisplay}`;
    await axios.post(`${TELEGRAM_API}/editMessageText`, { chat_id, message_id, text: editedText, parse_mode: "HTML" });

    await Request.findOneAndUpdate({ request_uuid }, { status, approver_fullname: fullName, approver_username: username, approver_display: approverDisplay, responded_at: now });
    await axios.post(BACKEND_CALLBACK_URL, { request_uuid, status, approver_fullname: fullName, approver_username: username, responded_at: now.toISOString() });

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

/* -------------------- OTHER ENDPOINTS -------------------- */
router.get("/set-webhook", async (req, res) => {
  try {
    const r = await axios.get(`${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`);
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/request-status/:uuid", async (req, res) => {
  const request = await Request.findOne({ request_uuid: req.params.uuid });
  if (!request) return res.status(404).json({ error: "Not found" });
  res.json({ request_uuid: request.request_uuid, status: request.status, approver_fullname: request.approver_fullname, approver_username: request.approver_username, responded_at: request.responded_at, telegram_message_id: request.telegram_message_id });
});

router.get("/test-send", async (req, res) => {
  try {
    const r = await axios.post(`${TELEGRAM_API}/sendMessage`, { chat_id: CHAT_ID, text: "Hello 👋 from /test-send" });
    res.json(r.data);
  } catch (err) {
    res.status(500).json(err.message);
  }
});

module.exports = router;