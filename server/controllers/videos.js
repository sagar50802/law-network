const Video = require('../models/Video');
const Playlist = require('../models/Playlist');

const list = async (req, res) => {
  try {
    const playlists = await Playlist.find().sort('name');
    const result = await Promise.all(playlists.map(async (pl) => {
      const items = await Video.find({ playlistName: pl.name }).sort('-createdAt');
      return {
        name: pl.name,
        locked: pl.locked,
        items: items.map(item => ({
          _id: item._id,
          title: item.title,
          videoUrl: item.videoPath,
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
    const videoPath = `/uploads/video/${req.file.filename}`;
    const video = new Video({ title, playlistName, videoPath });
    await video.save();
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await Video.findByIdAndDelete(id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { list, create, remove };