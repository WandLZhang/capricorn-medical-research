// src/components/Header/Header.js
import React from 'react';
import UserMenu from './UserMenu';

const Header = ({ user, handleLogin, handleLogout, showUserMenu, setShowUserMenu, isAuthenticated }) => {
  return (
    <header className="h-16 p-4 flex justify-between items-center">
      <h1 className="text-xl font-semibold"></h1>
      <UserMenu 
        user={user}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        showUserMenu={showUserMenu}
        setShowUserMenu={setShowUserMenu}
        isAuthenticated={isAuthenticated}
      />
    </header>
  );
};

export default Header;
