import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema({
  username: { type: String, default: "owner" },
  password: { type: String, required: true }, // hashed
  token: { type: String, default: "" } // session token
});

export default mongoose.model("Admin", AdminSchema);
