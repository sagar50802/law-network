import mongoose from "mongoose";


const StepStateSchema = new mongoose.Schema({
id: { type: String, enum: ["topic","literature","method","timeline","payment","done"], required: true },
status: { type: String, enum: ["locked","in_progress","completed","needs_edit"], default: "locked" },
completedAt: { type: Date },
}, { _id: false });


const ResearchProposalSchema = new mongoose.Schema({
userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // optional if you don't have User model
userEmail: { type: String, index: true },


title: String,
fields: {
lit: String,
method: String,
notes: String,
start: String,
end: String,
tools: String,
},


steps: { type: [StepStateSchema], default: [] }, // mirrored progress bar state
percent: { type: Number, default: 0, index: true },
lastUpdatedAt: { type: Date, default: Date.now, index: true },


payment: {
status: { type: String, enum: ["none","pending","verified"], default: "none", index: true },
amount: { type: Number, default: 0 },
vpa: String,
waNumber: String,
proofFiles: [{ path: String, name: String, size: Number }],
},


status: { type: String, enum: ["draft","submitted","locked","archived"], default: "draft", index: true },
}, { timestamps: true, collection: "research_proposals" });


export default mongoose.models.ResearchProposal || mongoose.model("ResearchProposal", ResearchProposalSchema);
