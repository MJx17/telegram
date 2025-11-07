const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  request_uuid: { type: String, required: true, unique: true },
  requestor_fullname: String,
  system_name: String,
  type: String,
  reason: String,
  requested_at: String,
  decision: { type: String, enum: ["approved", "declined", null], default: null },
  approver: { type: String, default: null },
  responded_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Request", RequestSchema);