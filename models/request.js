const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  request_uuid: {
    type: String,
    required: true,
    unique: true,
  },
  requestor_fullname: {
    type: String,
    required: true,
  },
  login_fullname: {
    type: String,
    default: null,
  },
  system_name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  requested_at: {
    type: Date,
    required: true,
  },
  expires_at: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["approved", "declined", "pending", "expired"],
    default: "pending",
  },
  approver_fullname: {
    type: String,
    default: null,
  },
  approver_username: {
    type: String,
    default: null,
  },
  approver_display: {
    type: String,
    default: null,
  },
  responded_at: {
    type: Date,
    default: null,
  },
  telegram_message_id: {
    type: Number,
    default: null,
  },
});

module.exports = mongoose.model("Request", RequestSchema);