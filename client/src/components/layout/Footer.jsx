import React, { useEffect, useState } from "react";
import { fetchJSON } from "/src/utils/api.js";

const Footer = () => {
  const [footerData, setFooterData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchFooter = async () => {
      try {
        const data = await fetchJSON("/footer");
        setFooterData(data);
      } catch (err) {
        console.error("Footer fetch error:", err);
        setError("Failed to load footer information");
      }
    };

    fetchFooter();
  }, []);

  if (error) {
    return (
      <footer className="bg-black text-white text-center py-4">
        {error}
      </footer>
    );
  }

  if (!footerData) return null;

  return (
    <footer className="bg-black text-white p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <h4 className="font-semibold mb-2">Address</h4>
          <p>{footerData.address}</p>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Links</h4>
          <ul className="space-y-1">
            {footerData.links?.map((link, idx) => (
              <li key={idx}>
                <a href={link.url} className="hover:underline">{link.label}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Contact</h4>
          <p>{footerData.email}</p>
          <p>{footerData.phone}</p>
        </div>
      </div>
      <p className="text-center mt-4 text-xs">&copy; {new Date().getFullYear()} Law Network</p>
    </footer>
  );
};

export default Footer;
