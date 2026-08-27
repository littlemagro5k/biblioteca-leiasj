import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";

// 🌟 Páginas
import Welcome from "./pages/Welcome/Welcome";
import Login from "./pages/Login/Login";
import Usuario from "./pages/Usuario/Usuario";
import Bibliotecario from "./pages/Bibliotecario/Bibliotecario";

export default function App() {
  return (
    <>
      <Navbar />
      <div className="container py-3">
        <Routes>
          {/* Página inicial agora é o Welcome */}
          <Route path="/" element={<Welcome />} />

          <Route path="/login" element={<Login />} />
          <Route path="/usuario" element={<Usuario />} />
          <Route path="/bibliotecario" element={<Bibliotecario />} />

          {/* Qualquer rota inválida volta para o Welcome */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
