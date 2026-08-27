import React from "react";
import "./Navbar.css";
import Logo from "../../assets/Logo3.png";

export default function Navbar() {
  return (
    <header className="navbar">
      <img src={Logo} alt="Logo LeiaSJ" className="navbar-logo" />
    </header>
  );
}
