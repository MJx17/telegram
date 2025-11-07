const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema(
  {
    request_uuid: { type: String, required: true, unique: true },
    requestor_fullname: String,
    system_name: String,
    type: String,
    reason: String,
    requested_at: String,
    decision: { type: String, enum: ["approve", "decline", null], default: null },
    approver: String,
    responded_at: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Request", RequestSchema);