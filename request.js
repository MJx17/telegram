import mongoose from "mongoose";

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

  // 🧠 Telegram approval fields
  decision: {
    type: String,
    enum: ["approved", "declined", null],
    default: null,
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
});

export default mongoose.model("Request", RequestSchema);