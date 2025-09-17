import axios from "axios";

const instance = axios.create({
  baseURL: "https://law-network.onrender.com/api", // ✅ fixed
  withCredentials: true, // keep cookies/sessions if needed
});

export default instance;
