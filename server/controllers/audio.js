const Audio = require('../models/Audio');
const Playlist = require('../models/Playlist');

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
    const { title, playlistName } = req.body;
    let playlist = await Playlist.findOne({ name: playlistName });
    if (!playlist) {
      playlist = new Playlist({ name: playlistName });
      await playlist.save();
    }
    const audioPath = `/uploads/audio/${req.file.filename}`;
    const audio = new Audio({ title, playlistName, audioPath });
    await audio.save();
    res.json(audio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const audio = await Audio.findByIdAndDelete(id);
    if (!audio) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    res.json({ message: 'Audio deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { list, create, remove };