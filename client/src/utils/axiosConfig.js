import axios from 'axios';

const instance = axios.create({
  baseURL: 'https://law-network.onrender.com', // 🔁 Your Render backend URL
});

export default instance;
