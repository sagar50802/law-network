// src/context/AuthContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null); // 'admin' or 'viewer'

  useEffect(() => {
    // Load token and role from localStorage on initial render
    const storedToken = localStorage.getItem('jwtToken');
    const storedRole = localStorage.getItem('userRole');
    const storedUser = JSON.parse(localStorage.getItem('userData'));
    if (storedToken) {
      setToken(storedToken);
      setRole(storedRole);
      setUser(storedUser);
    }
  }, []);

  const login = (userData, jwtToken, userRole) => {
    setUser(userData);
    setToken(jwtToken);
    setRole(userRole);
    localStorage.setItem('jwtToken', jwtToken);
    localStorage.setItem('userRole', userRole);
    localStorage.setItem('userData', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setRole(null);
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userData');
  };

  return (
    <AuthContext.Provider value={{ user, token, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};