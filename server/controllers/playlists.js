const Playlist = require('../models/Playlist');
const Audio = require('../models/Audio');

const list = async (req, res) => {
  try {
    const playlists = await Playlist.find().sort('name');
    const result = await Promise.all(playlists.map(async (pl) => {
      const items = await Audio.find({ playlistName: pl.name }).sort('-createdAt');
      return {
        name: pl.name,
        locked: pl.locked,
        items: items.map(item => ({
          _id: item._id,
          title: item.title,
          audioUrl: item.audioPath,
          playlistName: item.playlistName,
        })),
      };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, locked } = req.body;
    const existing = await Playlist.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: 'Playlist name already exists' });
    }
    const playlist = new Playlist({ name, locked: locked ?? true });
    await playlist.save();
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { name } = req.params;
    const playlist = await Playlist.findOneAndDelete({ name });
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    await Audio.deleteMany({ playlistName: name });
    res.json({ message: 'Playlist and its items deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const toggleLock = async (req, res) => {
  try {
    const { name } = req.params;
    const { locked } = req.body;
    const playlist = await Playlist.findOneAndUpdate(
      { name },
      { locked },
      { new: true }
    );
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { list, create, remove, toggleLock };