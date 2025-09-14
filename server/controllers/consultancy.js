const path = require('path');
const fs = require('fs');
const ConsultancyItem = require('../models/ConsultancyItem');

const OWNER_KEY = process.env.OWNER_KEY || '';
function isOwner(req) { return OWNER_KEY && String(req.headers['x-owner-key']||'') === OWNER_KEY; }
function toWebUrl(filePath) {
  if(!filePath) return '';
  return `/uploads/consultancy/${encodeURIComponent(path.basename(filePath))}`;
}
function unlinkSafe(p) { try{ if(p && fs.existsSync(p)) fs.unlinkSync(p); }catch(_){} }

async function getConsultancies(req, res) {
  try {
    const items = await ConsultancyItem.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch consultancy items', error: error.message });
  }
}

async function createConsultancy(req, res) {
  if (!isOwner(req)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { text } = req.body;
    const imagePath = req.file?.path;
    const imageUrl = toWebUrl(imagePath);

    const maxOrderItem = await ConsultancyItem.findOne().sort('-order');
    const nextOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;

    const newItem = new ConsultancyItem({
      text,
      imageUrl,
      imagePath,
      order: nextOrder
    });

    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create consultancy item', error: error.message });
  }
}

async function deleteConsultancy(req, res) {
  if (!isOwner(req)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    const item = await ConsultancyItem.findByIdAndDelete(id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Consultancy item not found' });
    }

    unlinkSafe(item.imagePath);
    res.json({ success: true, message: 'Consultancy item deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete consultancy item', error: error.message });
  }
}

async function reorderConsultancies(req, res) {
  if (!isOwner(req)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    let updates = [];
    if (Array.isArray(req.body.order)) {
      updates = req.body.order.map(({ _id, order }) => ({
        updateOne: {
          filter: { _id },
          update: { $set: { order } }
        }
      }));
    } else if (Array.isArray(req.body.ids)) {
      updates = req.body.ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { order: index } }
        }
      }));
    } else {
      return res.status(400).json({ success: false, message: 'Invalid reorder data' });
    }

    await ConsultancyItem.bulkWrite(updates);
    const updatedItems = await ConsultancyItem.find().sort({ order: 1 });
    res.json({ success: true, data: updatedItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reorder items', error: error.message });
  }
}

module.exports = { getConsultancies, createConsultancy, deleteConsultancy, reorderConsultancies };