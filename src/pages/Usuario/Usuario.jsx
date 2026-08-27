import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, User, AlertTriangle, Clock } from "lucide-react";
import "./Usuario.css";
import {
  fetchBooks,
  solicitarEmprestimo,
  fetchEmprestimosDoAluno,
} from "../../services/api";

export default function Usuario() {
  const [livros, setLivros] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [meusEmprestimos, setMeusEmprestimos] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [mostrarNotificacoes, setMostrarNotificacoes] = useState(false);
  const [solicitando, setSolicitando] = useState(null);
  const navigate = useNavigate();

  // === Carrega usuário e livros ===
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("leiasj_logged_user"));
    if (!userData) {
      navigate("/login");
      return;
    }
    setUsuario(userData);

    fetchBooks()
      .then(setLivros)
      .catch((error) => console.error("Erro ao sincronizar catálogo", error));
  }, [navigate]);

  // === Carrega meus empréstimos reais do backend ===
  const carregarMeusEmprestimos = useCallback(async () => {
    if (!usuario?.id) return;
    try {
      const dados = await fetchEmprestimosDoAluno(usuario.id);
      setMeusEmprestimos(dados);

      const hoje = new Date();
      const avisos = [];
      dados.forEach((e) => {
        if (e.status === "Emprestado" && e.prazo) {
          const diff = Math.ceil(
            (new Date(e.prazo) - hoje) / (1000 * 60 * 60 * 24)
          );
          if (diff <= 3) {
            avisos.push({ id: e.id, livro: e.livroTitulo, dias: diff });
          }
        }
      });
      setNotificacoes(avisos);
    } catch (error) {
      console.error("Erro ao carregar meus empréstimos", error);
    }
  }, [usuario]);

  useEffect(() => {
    if (!usuario) return;
    carregarMeusEmprestimos();
    const interval = setInterval(carregarMeusEmprestimos, 15000);
    return () => clearInterval(interval);
  }, [usuario, carregarMeusEmprestimos]);

  // === Solicitação de empréstimo (agora salva no banco de dados real) ===
  const handleSolicitar = async (livro) => {
    if (!usuario) return alert("Você precisa estar logado para solicitar.");
    if (Number(livro.quantidade) <= 0) {
      alert(`O livro "${livro.titulo}" não está disponível no momento.`);
      return;
    }

    setSolicitando(livro.id);
    try {
      await solicitarEmprestimo(livro.id, usuario.id);
      alert("Solicitação enviada para o bibliotecário!");
      carregarMeusEmprestimos();
    } catch (error) {
      alert(error.message || "Não foi possível enviar a solicitação.");
    } finally {
      setSolicitando(null);
    }
  };

  // === Status do empréstimo de um livro para o aluno atual ===
  const statusDoLivro = (livroId) => {
    const emp = meusEmprestimos.find(
      (e) =>
        e.livroId === livroId && (e.status === "Pendente" || e.status === "Emprestado")
    );
    return emp ? emp.status : null;
  };

  // === Logout ===
  const handleLogout = () => {
    if (window.confirm("Tem certeza que deseja sair?")) {
      localStorage.removeItem("leiasj_logged_user");
      navigate("/login");
    }
  };

  return (
    <div className="usuario-page">
      <header className="usuario-header">
        <h2>Catálogo de Livros</h2>
        {usuario && (
          <div className="usuario-info">
            <div className="user-icon">
              <User size={18} />
              <span>{usuario.nomeCompleto}</span>
            </div>

            {/* 🔔 Sino de notificação */}
            <div className="notif-wrapper">
              <button
                className={`btn-bell ${notificacoes.length > 0 ? "ativo" : ""}`}
                onClick={() => setMostrarNotificacoes((v) => !v)}
                aria-label="Notificações"
              >
                <Bell size={22} />
                {notificacoes.length > 0 && (
                  <span className="badge-dot">{notificacoes.length}</span>
                )}
              </button>

              {mostrarNotificacoes && (
                <div className="notif-panel">
                  <div className="notif-head">
                    <strong>Notificações</strong>
                    <button
                      className="btn-mini"
                      onClick={() => setNotificacoes([])}
                    >
                      Limpar
                    </button>
                  </div>
                  <ul>
                    {notificacoes.length === 0 ? (
                      <li className="n-info">Nenhum alerta no momento.</li>
                    ) : (
                      notificacoes.map((n) => (
                        <li key={n.id} className="n-warning">
                          <AlertTriangle
                            size={16}
                            color="#ffdd55"
                            style={{ marginRight: "6px" }}
                          />
                          <span className="n-text">
                            O prazo de <b>{n.livro}</b> termina em{" "}
                            <b>{n.dias}</b> dia{n.dias > 1 ? "s" : ""}.
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

            <button className="btn-sair" onClick={handleLogout}>
              Sair
            </button>
          </div>
        )}
      </header>

      {meusEmprestimos.some((e) => e.status === "Emprestado") && (
        <div className="card" style={{ margin: "0 24px 16px" }}>
          <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} /> Meus empréstimos ativos
          </h4>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {meusEmprestimos
              .filter((e) => e.status === "Emprestado")
              .map((e) => (
                <li key={e.id}>
                  <b>{e.livroTitulo}</b> — devolver até{" "}
                  {e.prazo
                    ? new Date(e.prazo).toLocaleDateString("pt-BR")
                    : "—"}
                </li>
              ))}
          </ul>
        </div>
      )}

      {livros.length === 0 ? (
        <p className="texto-vazio">Nenhum livro disponível no momento.</p>
      ) : (
        <div className="livros-grid">
          {livros.map((livro) => {
            const indisponivel = Number(livro.quantidade) <= 0;
            const status = statusDoLivro(livro.id);
            return (
              <div key={livro.id} className="livro-card">
                <img
                  src={
                    livro.capa ||
                    "https://via.placeholder.com/120x160?text=Sem+Capa"
                  }
                  alt={livro.titulo}
                />
                <h4 title={livro.titulo}>{livro.titulo}</h4>
                <p className="autor">{livro.autor}</p>
                <p>
                  <strong>Gênero:</strong> {livro.genero}
                </p>
                <p>
                  <strong>Ano:</strong> {livro.ano ?? "Não informado"}
                </p>
                <p className="qtd">
                  <strong>Disponíveis:</strong> {livro.quantidade}
                </p>

                {indisponivel && !status && (
                  <div className="badge-indisponivel">
                    Não disponível no momento
                  </div>
                )}

                <button
                  className="btn btn-warning btn-sm mt-2"
                  onClick={() => handleSolicitar(livro)}
                  disabled={indisponivel || !!status || solicitando === livro.id}
                >
                  {status === "Pendente"
                    ? "Aguardando aprovação"
                    : status === "Emprestado"
                    ? "Já emprestado a você"
                    : solicitando === livro.id
                    ? "Enviando..."
                    : indisponivel
                    ? "Indisponível"
                    : "Solicitar Empréstimo"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
