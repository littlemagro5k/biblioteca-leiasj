import React from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import "./Welcome.css";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="bg-circle c1"></div>
      <div className="bg-circle c2"></div>

      <div className="welcome-card">
        <div className="icon-wrap">
          <BookOpen size={64} color="#ffdd55" />
        </div>
        <h1>Bem-vindo ao LeiaSJ!</h1>
        <p>
          Que tal dar uma olhada nos livros que temos disponíveis na biblioteca
          da escola?
        </p>
        <button className="btn-vamos" onClick={() => navigate("/login")}>
          VAMOS LÁ
        </button>
      </div>
    </div>
  );
}
