import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Tabs, Tab } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Book,
  Users,
  Archive,
  AlertTriangle,
  Info,
  LogOut,
  User,
  Trash2,
  CheckCircle,
  PlusCircle,
  Pencil,
  X,
  Save,
} from "lucide-react";
import "./Bibliotecario.css";
import {
  fetchBooks,
  createBook as createBookApi,
  updateBook as updateBookApi,
  deleteBook as deleteBookApi,
  logoutBibliotecario,
  fetchStudents as fetchStudentsApi,
  updateStudent as updateStudentApi,
  deleteStudent as deleteStudentApi,
  fetchLibrarians as fetchLibrariansApi,
  createLibrarian as createLibrarianApi,
  updateLibrarian as updateLibrarianApi,
  deleteLibrarian as deleteLibrarianApi,
  fetchEmprestimos as fetchEmprestimosApi,
  aprovarEmprestimo as aprovarEmprestimoApi,
  rejeitarEmprestimo as rejeitarEmprestimoApi,
  devolverEmprestimo as devolverEmprestimoApi,
} from "../../services/api";

const K_BOOKS = "leiasj_books_v1";

// Fora do componente: função estável, sem re-criações desnecessárias
function mapGoogleItem(item) {
  const info = item.volumeInfo;
  const ano = (info.publishedDate || "").match(/\d{4}/)?.[0] || "";
  const capaRaw =
    info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
  return {
    id: item.id,
    titulo: info.title || "Sem título",
    autor: info.authors?.join(", ") || "Autor desconhecido",
    genero: info.categories?.[0] || "",
    ano,
    // Google retorna http://, browsers bloqueiam em sites https — forçamos https
    capa: capaRaw.replace(/^http:\/\//, "https://"),
    quantidade: 1,
  };
}
const K_USERS = "leiasj_users_v1";
const K_LOANS = "leiasj_loans_v1";
const K_LOGGED = "leiasj_logged_user";
const K_NOTIFS = "leiasj_notifications_v1";

export default function Bibliotecario() {
  const navigate = useNavigate();

  // ===== Estado geral =====
  const [tab, setTab] = useState("livros");

  // Livros
  const [books, setBooks] = useState([]);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [novoLivro, setNovoLivro] = useState({
    titulo: "",
    autor: "",
    genero: "",
    ano: "",
    quantidade: 1,
    capa: "",
  });

  // Edição de livro
  const [editId, setEditId] = useState(null);
  const [editBook, setEditBook] = useState({
    titulo: "",
    autor: "",
    genero: "",
    ano: "",
    quantidade: 1,
    capa: "",
  });

  // Usuários
  const [users, setUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [novoBibliotecario, setNovoBibliotecario] = useState({
    nome: "",
    turno: "",
    codigo: "",
    senha: "",
  });

  // Empréstimos
  const [emprestimos, setEmprestimos] = useState([]);

  // Sessão + Notificações
  const [bibliotecario, setBibliotecario] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const seenIdsRef = useRef(new Set());
  const audioRef = useRef(null);

  const carregarLivros = useCallback(async () => {
    try {
      const dados = await fetchBooks();
      setBooks(dados);
      localStorage.setItem(K_BOOKS, JSON.stringify(dados));
    } catch (error) {
      console.error("Erro ao carregar livros do banco", error);
    }
  }, []);

  const carregarUsuarios = useCallback(async () => {
    try {
      const [dadosAlunos, dadosBibliotecarios] = await Promise.all([
        fetchStudentsApi(),
        fetchLibrariansApi(),
      ]);

      const alunos = (dadosAlunos || []).map((aluno) => ({
        id: aluno.id,
        nome: aluno.nomeCompleto,
        tipo: "aluno",
        serie: aluno.serie || "",
        sala: aluno.sala || "",
        funcao: "",
        codigo: "",
      }));

      const bibliotecarios = (dadosBibliotecarios || []).map((bibliotecario) => ({
        id: bibliotecario.id,
        nome: bibliotecario.nomeCompleto,
        tipo: "bibliotecario",
        serie: "",
        sala: "",
        funcao: "",
        turno: bibliotecario.turno || "",
        codigo: bibliotecario.codigo || "",
      }));

      setUsers((prev) => {
        const outros = prev.filter(
          (u) => !["aluno", "bibliotecario"].includes(u.tipo)
        );
        const next = [...outros, ...bibliotecarios, ...alunos];
        localStorage.setItem(K_USERS, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.error("Erro ao carregar usuários do banco", error);
    }
  }, []);

  const carregarEmprestimos = useCallback(async () => {
    try {
      const dados = await fetchEmprestimosApi();
      setEmprestimos(dados);
      return dados;
    } catch (error) {
      console.error("Erro ao carregar empréstimos", error);
      return [];
    }
  }, []);

  // ===== Helpers =====
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const addDaysISO = (startISO, days) => {
    const d = new Date(startISO);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const isAtrasado = (prazo) => prazo && prazo < todayISO();

  const normalizarAno = (valor) => {
    const numero = Number.parseInt(valor, 10);
    return Number.isNaN(numero) ? null : numero;
  };

  // ===== Init =====
  useEffect(() => {
    const armazenados = JSON.parse(localStorage.getItem(K_BOOKS)) || [];
    if (armazenados.length) {
      setBooks(armazenados);
    }
    setUsers(JSON.parse(localStorage.getItem(K_USERS)) || []);
    setBibliotecario(JSON.parse(localStorage.getItem(K_LOGGED)) || null);
    setNotifs(JSON.parse(localStorage.getItem(K_NOTIFS)) || []);

    carregarLivros();
    carregarUsuarios();
    carregarEmprestimos();
  }, [carregarLivros, carregarUsuarios, carregarEmprestimos]);

  const sair = async () => {
    if (window.confirm("Deseja realmente sair?")) {
      try {
        await logoutBibliotecario();
      } catch (error) {
        console.error("Erro ao encerrar sessão", error);
      }
      localStorage.removeItem(K_LOGGED);
      navigate("/login");
    }
  };

  // ===== Notificações =====
  const persistNotifs = useCallback((next) => {
    setNotifs(next);
    localStorage.setItem(K_NOTIFS, JSON.stringify(next));
  }, []);

  const pushNotif = useCallback(
    ({ type, text, refId }) => {
      const n = {
        id: Date.now() + Math.random().toString(36).slice(2),
        ts: new Date().toISOString(),
        type,
        text,
        read: false,
        refId: refId || null,
      };
      const next = [n, ...(JSON.parse(localStorage.getItem(K_NOTIFS)) || [])];
      persistNotifs(next);
      if (audioRef.current) audioRef.current.play();
    },
    [persistNotifs]
  );

  const markAllRead = useCallback(() => {
    const next = notifs.map((n) => ({ ...n, read: true }));
    persistNotifs(next);
  }, [notifs, persistNotifs]);

  const unreadCount = useMemo(
    () => notifs.filter((n) => !n.read).length,
    [notifs]
  );

  // ===== Verificação automática de empréstimos (novos/ prazos) =====
  const checkLoansAndNotify = useCallback(async () => {
    const freshLoans = await carregarEmprestimos();

    freshLoans.forEach((e) => {
      if (e.status === "Pendente" && !seenIdsRef.current.has(e.id)) {
        seenIdsRef.current.add(e.id);
        pushNotif({
          type: "loan",
          text: `Novo pedido: ${e.livroTitulo || "Livro"} por ${
            e.alunoNome || "Aluno"
          }`,
          refId: e.id,
        });
      }

      // Prazo próximo (<= 2 dias) alerta pro bibliotecário
      if (e.status === "Emprestado" && e.prazo) {
        const rest = Math.ceil(
          (new Date(e.prazo) - new Date()) / (1000 * 60 * 60 * 24)
        );
        if (rest <= 2 && rest >= 0) {
          const key = `near-${e.id}-${e.prazo}`;
          if (!seenIdsRef.current.has(key)) {
            seenIdsRef.current.add(key);
            pushNotif({
              type: "warning",
              text: `Prazo próximo (${rest} dia${rest === 1 ? "" : "s"}): ${
                e.livroTitulo
              } — ${e.alunoNome}`,
              refId: e.id,
            });
          }
        }
      }
    });
  }, [pushNotif, carregarEmprestimos]);

  useEffect(() => {
    const interval = setInterval(checkLoansAndNotify, 8000);
    checkLoansAndNotify();
    return () => clearInterval(interval);
  }, [checkLoansAndNotify]);

  // ===== Livros =====
  const [sugestoes, setSugestoes] = useState([]);
  const [buscandoAPI, setBuscandoAPI] = useState(false);
  const debounceRef = useRef(null);

  const buscarSugestoes = useCallback((texto) => {
    clearTimeout(debounceRef.current);
    if (!texto.trim() || texto.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(texto)}&maxResults=6`
        );
        const data = await res.json();
        setSugestoes((data.items || []).map(mapGoogleItem));
      } catch {
        setSugestoes([]);
      }
    }, 350);
  }, []);

  const selecionarSugestao = (livro) => {
    setNovoLivro({
      titulo: livro.titulo,
      autor: livro.autor,
      genero: livro.genero,
      ano: livro.ano,
      quantidade: 1,
      capa: livro.capa,
    });
    setTermo("");
    setSugestoes([]);
  };

  async function buscarNaAPI(e) {
    e.preventDefault();
    if (!termo.trim()) return;
    setBuscandoAPI(true);
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(termo)}&maxResults=12`
      );
      const data = await res.json();
      setResultados((data.items || []).map(mapGoogleItem));
      setSugestoes([]);
    } catch {
      alert("Erro ao buscar livros na API.");
    } finally {
      setBuscandoAPI(false);
    }
  }

  const adicionarLivroManual = async (e) => {
    e.preventDefault();
    if (!novoLivro.titulo || !novoLivro.autor)
      return alert("Preencha ao menos Título e Autor.");
    try {
      await createBookApi({
        titulo: novoLivro.titulo,
        autor: novoLivro.autor,
        genero: novoLivro.genero,
        ano: normalizarAno(novoLivro.ano),
        quantidade: Number(novoLivro.quantidade) || 1,
        capa: novoLivro.capa,
      });
      setNovoLivro({
        titulo: "",
        autor: "",
        genero: "",
        ano: "",
        quantidade: 1,
        capa: "",
      });
      await carregarLivros();
    } catch (error) {
      alert(error.message || "Erro ao adicionar livro.");
    }
  };

  const adicionarLivroAPI = async (livro) => {
    try {
      await createBookApi({
        titulo: livro.titulo,
        autor: livro.autor,
        genero: livro.genero,
        ano: normalizarAno(livro.ano),
        quantidade: Number(livro.quantidade) || 1,
        capa: livro.capa,
      });
      await carregarLivros();
    } catch (error) {
      alert(error.message || "Erro ao salvar livro da API.");
    }
  };

  const excluirLivro = async (id) => {
    if (!window.confirm("Excluir este livro?")) return;
    try {
      await deleteBookApi(id);
      await carregarLivros();
    } catch (error) {
      alert(error.message || "Erro ao excluir livro.");
    }
  };

  // Edição completa do livro
  const startEditBook = (b) => {
    setEditId(b.id);
    setEditBook({
      titulo: b.titulo || "",
      autor: b.autor || "",
      genero: b.genero || "",
      ano: b.ano ? String(b.ano) : "",
      quantidade: Number(b.quantidade || 1),
      capa: b.capa || "",
    });
  };

  const cancelEditBook = () => {
    setEditId(null);
    setEditBook({
      titulo: "",
      autor: "",
      genero: "",
      ano: "",
      quantidade: 1,
      capa: "",
    });
  };

  const saveEditBook = async () => {
    if (!editBook.titulo || !editBook.autor)
      return alert("Preencha ao menos Título e Autor.");
    try {
      await updateBookApi(editId, {
        titulo: editBook.titulo,
        autor: editBook.autor,
        genero: editBook.genero,
        ano: normalizarAno(editBook.ano),
        quantidade: Number(editBook.quantidade) || 0,
        capa: editBook.capa,
      });
      cancelEditBook();
      await carregarLivros();
    } catch (error) {
      alert(error.message || "Erro ao atualizar livro.");
    }
  };

  // ===== Empréstimos (agora via API real, persistido no banco) =====
  const aprovarEmprestimo = async (eid) => {
    try {
      await aprovarEmprestimoApi(eid);
      await carregarEmprestimos();
      await carregarLivros();
      pushNotif({ type: "info", text: "Empréstimo aprovado.", refId: eid });
    } catch (error) {
      alert(error.message || "Erro ao aprovar empréstimo.");
    }
  };

  const rejeitarSolicitacao = async (eid) => {
    try {
      await rejeitarEmprestimoApi(eid);
      await carregarEmprestimos();
      pushNotif({ type: "warning", text: "Solicitação rejeitada.", refId: eid });
    } catch (error) {
      alert(error.message || "Erro ao rejeitar solicitação.");
    }
  };

  const marcarDevolvido = async (eid) => {
    try {
      await devolverEmprestimoApi(eid);
      await carregarEmprestimos();
      await carregarLivros();
      pushNotif({ type: "info", text: "Devolução registrada.", refId: eid });
    } catch (error) {
      alert(error.message || "Erro ao registrar devolução.");
    }
  };


  // ===== Usuários =====
  const adicionarBibliotecario = async (event) => {
    event.preventDefault();
    const nome = novoBibliotecario.nome.trim();
    const turno = novoBibliotecario.turno.trim();
    const codigo = novoBibliotecario.codigo.trim();
    const senha = novoBibliotecario.senha.trim();

    if (!nome || !codigo || !senha) {
      alert("Informe nome, código e senha do bibliotecário.");
      return;
    }
    if (senha.length < 4) {
      alert("A senha deve ter pelo menos 4 caracteres.");
      return;
    }

    const codigoExistente = users.some(
      (u) =>
        u.tipo === "bibliotecario" &&
        (u.codigo || "").toLowerCase() === codigo.toLowerCase()
    );

    if (codigoExistente) {
      alert("Já existe um bibliotecário cadastrado com esse código.");
      return;
    }

    try {
      const resposta = await createLibrarianApi({
        nomeCompleto: nome,
        codigo,
        senha,
        turno,
      });
      await carregarUsuarios();
      setNovoBibliotecario({ nome: "", turno: "", codigo: "", senha: "" });

      const cadastrado = resposta?.bibliotecario || null;
      const nomeCadastrado = cadastrado?.nomeCompleto || nome;
      const idCadastrado = cadastrado?.id || Date.now();

      pushNotif({
        type: "info",
        text: `Bibliotecário "${nomeCadastrado}" cadastrado.`,
        refId: idCadastrado,
      });
      alert(resposta?.mensagem || `Bibliotecário "${nomeCadastrado}" cadastrado!`);
    } catch (error) {
      alert(error.message || "Erro ao cadastrar bibliotecário.");
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setNovaSenha("");
  };

  const salvarSenha = async (u) => {
    if (!novaSenha || novaSenha.length < 4)
      return alert("A nova senha deve ter pelo menos 4 caracteres.");
    if (u.tipo === "aluno") {
      try {
        await updateStudentApi(u.id, { senha: novaSenha });
        await carregarUsuarios();
        setEditingId(null);
        setNovaSenha("");
        alert(`Senha de "${u.nome}" atualizada!`);
      } catch (error) {
        alert(error.message || "Erro ao atualizar senha do aluno.");
      }
      return;
    }

    if (u.tipo === "bibliotecario") {
      try {
        await updateLibrarianApi(u.id, { senha: novaSenha });
        await carregarUsuarios();
        setEditingId(null);
        setNovaSenha("");
        alert(`Senha de "${u.nome}" atualizada!`);
      } catch (error) {
        alert(
          error.message || "Erro ao atualizar senha do bibliotecário."
        );
      }
      return;
    }

    const updated = users.map((usr) =>
      usr.id === u.id ? { ...usr, senha: novaSenha } : usr
    );
    setUsers(updated);
    localStorage.setItem(K_USERS, JSON.stringify(updated));
    setEditingId(null);
    setNovaSenha("");
    alert(`Senha de "${u.nome}" atualizada!`);
  };

  const excluirUsuario = async (u) => {
    if (!window.confirm(`Excluir o usuário "${u.nome}"?`)) return;
    if (u.tipo === "aluno") {
      try {
        await deleteStudentApi(u.id);
        await carregarUsuarios();
        alert(`Usuário "${u.nome}" removido!`);
      } catch (error) {
        alert(error.message || "Erro ao excluir aluno.");
      }
      return;
    }

    if (u.tipo === "bibliotecario") {
      try {
        await deleteLibrarianApi(u.id);
        await carregarUsuarios();
        alert(`Usuário "${u.nome}" removido!`);
      } catch (error) {
        alert(error.message || "Erro ao excluir bibliotecário.");
      }
      return;
    }

    const updated = users.filter((x) => x.id !== u.id);
    setUsers(updated);
    localStorage.setItem(K_USERS, JSON.stringify(updated));
    alert(`Usuário "${u.nome}" removido!`);
  };

  // Filtros usuários
  const filtrados = users.filter((u) =>
    (u.nome || "").toLowerCase().includes(buscaUsuario.toLowerCase())
  );
  const alunos = filtrados.filter((u) => u.tipo === "aluno");
  const funcionarios = filtrados.filter((u) => u.tipo === "funcionario");
  const bibliotecarios = filtrados.filter((u) => u.tipo === "bibliotecario");
  const formatSerieSala = (u) => {
    const serieAtual = u.serie || "";
    const salaAtual = u.sala || "";
    if (!serieAtual && !salaAtual) return "-";
    return salaAtual ? `${serieAtual} ${salaAtual}` : serieAtual;
  };

  return (
    <div className="bib-page">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />
      <header className="bib-top">
        <h2>
          <Book size={22} /> Painel do Bibliotecário
        </h2>
        <div className="bib-actions">
          <div className="notif-wrapper">
            <button
              className={`btn-bell ${unreadCount > 0 ? "ativo" : ""}`}
              onClick={() => {
                setNotifOpen((o) => !o);
                markAllRead();
              }}
              aria-label="Notificações"
            >
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="badge-dot">{unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="notif-panel">
                <div className="notif-head">
                  <strong>Notificações</strong>
                  <button
                    className="btn-mini"
                    onClick={() => persistNotifs([])}
                  >
                    Limpar tudo
                  </button>
                </div>
                {notifs.length === 0 ? (
                  <p className="vazio">Sem notificações.</p>
                ) : (
                  <ul>
                    {notifs.map((n) => (
                      <li
                        key={n.id}
                        className={`n-${n.type} ${n.read ? "read" : ""}`}
                      >
                        {n.type === "warning" && (
                          <AlertTriangle size={16} color="#ffdd55" />
                        )}
                        {n.type === "info" && (
                          <Info size={16} color="#3771c8" />
                        )}
                        <span className="n-text">{n.text}</span>
                        <span className="n-time">
                          {new Date(n.ts).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="bib-right">
            <span className="bib-user">
              <User size={16} />{" "}
              <strong>{bibliotecario?.nome || "Bibliotecário"}</strong>
            </span>
            <button className="btn-logout" onClick={sair}>
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      <Tabs activeKey={tab} onSelect={(k) => setTab(k || "livros")}>
        {/* ===== LIVROS ===== */}
        <Tab
          eventKey="livros"
          title={
            <>
              <Book size={16} /> Livros
            </>
          }
        >
          <div className="tab-body">
            <div className="card">
              <h4>
                <PlusCircle size={16} /> Adicionar livro manualmente
              </h4>
              <form onSubmit={adicionarLivroManual}>
                <input
                  type="text"
                  placeholder="Título"
                  value={novoLivro.titulo}
                  onChange={(e) =>
                    setNovoLivro({ ...novoLivro, titulo: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="Autor"
                  value={novoLivro.autor}
                  onChange={(e) =>
                    setNovoLivro({ ...novoLivro, autor: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="Gênero"
                  value={novoLivro.genero}
                  onChange={(e) =>
                    setNovoLivro({ ...novoLivro, genero: e.target.value })
                  }
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Ano"
                  value={novoLivro.ano}
                  onChange={(e) =>
                    setNovoLivro({ ...novoLivro, ano: e.target.value })
                  }
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Quantidade"
                  value={novoLivro.quantidade}
                  onChange={(e) =>
                    setNovoLivro({ ...novoLivro, quantidade: e.target.value })
                  }
                />

                {/* Capa: pode vir da API ou colar manualmente */}
                <div
                  className="upload-area"
                  onPaste={(e) => {
                    const items = Array.from(e.clipboardData?.items || []);
                    const img = items.find((i) => i.type?.startsWith("image/"));
                    if (!img) return alert("Cole uma imagem válida (Ctrl+V).");
                    const file = img.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (ev) =>
                      setNovoLivro({ ...novoLivro, capa: ev.target.result });
                    reader.readAsDataURL(file);
                  }}
                >
                  {novoLivro.capa ? (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={novoLivro.capa}
                        alt="Capa"
                        className="preview-capa"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                      <button
                        type="button"
                        className="btn-mini"
                        style={{ position: "absolute", top: 4, right: 4 }}
                        onClick={() => setNovoLivro({ ...novoLivro, capa: "" })}
                        title="Remover capa"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <p>Capa virá da API ou cole aqui (Ctrl + V)</p>
                  )}
                </div>
                <button className="btn-azul">Adicionar</button>
              </form>
            </div>

            <div className="card">
              <h4>
                <Book size={16} /> Buscar livro pela API (Google Books)
              </h4>
              {/* Campo com autocomplete em tempo real */}
              <div className="autocomplete-wrapper">
                <form onSubmit={buscarNaAPI} className="search-row">
                  <input
                    type="text"
                    placeholder="Digite o título ou autor para buscar..."
                    value={termo}
                    onChange={(e) => {
                      setTermo(e.target.value);
                      buscarSugestoes(e.target.value);
                    }}
                    onBlur={() => setTimeout(() => setSugestoes([]), 200)}
                    autoComplete="off"
                  />
                  <button className="btn-azul" disabled={buscandoAPI}>
                    {buscandoAPI ? "Buscando..." : "Buscar"}
                  </button>
                </form>

                {/* Dropdown de sugestões em tempo real */}
                {sugestoes.length > 0 && (
                  <ul className="autocomplete-list">
                    {sugestoes.map((livro) => (
                      <li
                        key={livro.id}
                        className="autocomplete-item"
                        onMouseDown={() => selecionarSugestao(livro)}
                      >
                        {livro.capa ? (
                          <img
                            src={livro.capa}
                            alt={livro.titulo}
                            className="autocomplete-capa"
                          />
                        ) : (
                          <div className="autocomplete-capa autocomplete-sem-capa">
                            📚
                          </div>
                        )}
                        <div className="autocomplete-info">
                          <span className="autocomplete-titulo">{livro.titulo}</span>
                          <span className="autocomplete-autor">{livro.autor}</span>
                          {livro.ano && (
                            <span className="autocomplete-ano">{livro.ano}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Grade de resultados após clicar "Buscar" */}
              <div className="livros-grid">
                {resultados.map((livro) => (
                  <div key={livro.id} className="livro-card">
                    <img
                      src={livro.capa || "https://via.placeholder.com/120x160?text=Sem+Capa"}
                      alt={livro.titulo}
                      onError={(e) => {
                        e.target.src = "https://via.placeholder.com/120x160?text=Sem+Capa";
                      }}
                    />
                    <h5 title={livro.titulo}>{livro.titulo}</h5>
                    <p className="autor">{livro.autor}</p>
                    {livro.genero && <p className="genero">{livro.genero}</p>}
                    <p className="ano">{livro.ano || "Ano desconhecido"}</p>
                    <button
                      className="btn-amarelo"
                      onClick={() => adicionarLivroAPI(livro)}
                    >
                      + Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Catálogo atual */}
            <h4 className="sec-title">Catálogo atual</h4>
            <div className="livros-grid">
              {books.length === 0 ? (
                <p className="vazio">Nenhum livro no catálogo.</p>
              ) : (
                books.map((b) => (
                  <div key={b.id} className="livro-card">
                    <img
                      src={b.capa || "https://via.placeholder.com/120x160"}
                      alt={b.titulo}
                    />
                    {editId === b.id ? (
                      <>
                        <input
                          type="text"
                          value={editBook.titulo}
                          onChange={(e) =>
                            setEditBook((p) => ({
                              ...p,
                              titulo: e.target.value,
                            }))
                          }
                          placeholder="Título"
                        />
                        <input
                          type="text"
                          value={editBook.autor}
                          onChange={(e) =>
                            setEditBook((p) => ({
                              ...p,
                              autor: e.target.value,
                            }))
                          }
                          placeholder="Autor"
                        />
                        <input
                          type="text"
                          value={editBook.genero}
                          onChange={(e) =>
                            setEditBook((p) => ({
                              ...p,
                              genero: e.target.value,
                            }))
                          }
                          placeholder="Gênero"
                        />
                        <input
                          type="number"
                          min="0"
                          value={editBook.ano}
                          onChange={(e) =>
                            setEditBook((p) => ({
                              ...p,
                              ano: e.target.value,
                            }))
                          }
                          placeholder="Ano"
                        />
                        <input
                          type="number"
                          min="0"
                          value={editBook.quantidade}
                          onChange={(e) =>
                            setEditBook((p) => ({
                              ...p,
                              quantidade: e.target.value,
                            }))
                          }
                          placeholder="Quantidade"
                        />
                        <div
                          className="upload-area mini"
                          title="Cole uma nova capa (Ctrl+V)"
                          onPaste={(e) => {
                            const items = Array.from(
                              e.clipboardData?.items || []
                            );
                            const img = items.find((i) =>
                              i.type?.startsWith("image/")
                            );
                            if (!img) return alert("Cole uma imagem válida.");
                            const file = img.getAsFile();
                            const reader = new FileReader();
                            reader.onload = (ev) =>
                              setEditBook((p) => ({
                                ...p,
                                capa: ev.target.result,
                              }));
                            reader.readAsDataURL(file);
                          }}
                        >
                          {editBook.capa ? (
                            <img
                              src={editBook.capa}
                              alt="Capa"
                              className="preview-capa"
                            />
                          ) : (
                            <p>Cole a nova capa aqui</p>
                          )}
                        </div>
                        <div className="row-btns">
                          <button className="btn-verde" onClick={saveEditBook}>
                            <Save size={14} /> Salvar
                          </button>
                          <button
                            className="btn-vermelho"
                            onClick={cancelEditBook}
                          >
                            <X size={14} /> Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h5 title={b.titulo}>{b.titulo}</h5>
                        <p className="autor">{b.autor}</p>
                        <p className="genero">{b.genero}</p>
                        <p className="ano">
                          Ano: {b.ano ?? "Não informado"}
                        </p>
                        <p className="qtd">
                          Qtd:{" "}
                          <strong
                            style={{
                              color:
                                Number(b.quantidade) === 0 ? "red" : "#0c1a35",
                            }}
                          >
                            {b.quantidade}
                          </strong>
                        </p>
                        <div className="row-btns">
                          <button
                            className="btn-azul"
                            onClick={() => startEditBook(b)}
                          >
                            <Pencil size={14} /> Editar
                          </button>
                          <button
                            className="btn-vermelho"
                            onClick={() => excluirLivro(b.id)}
                          >
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Tab>

        {/* ===== USUÁRIOS ===== */}
        <Tab
          eventKey="usuarios"
          title={
            <>
              <Users size={16} /> Usuários
            </>
          }
        >
          <div className="tab-body">
            <div className="card">
              <h4>
                <PlusCircle size={16} /> Adicionar bibliotecário
              </h4>
              <form
                onSubmit={adicionarBibliotecario}
                className="form-grid two-cols"
              >
                <input
                  className="full-span"
                  type="text"
                  placeholder="Nome completo"
                  value={novoBibliotecario.nome}
                  onChange={(e) =>
                    setNovoBibliotecario((prev) => ({
                      ...prev,
                      nome: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  type="text"
                  placeholder="Turno (opcional)"
                  value={novoBibliotecario.turno}
                  onChange={(e) =>
                    setNovoBibliotecario((prev) => ({
                      ...prev,
                      turno: e.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  placeholder="Código de acesso"
                  value={novoBibliotecario.codigo}
                  onChange={(e) =>
                    setNovoBibliotecario((prev) => ({
                      ...prev,
                      codigo: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={novoBibliotecario.senha}
                  onChange={(e) =>
                    setNovoBibliotecario((prev) => ({
                      ...prev,
                      senha: e.target.value,
                    }))
                  }
                  required
                />
                <button type="submit" className="btn-azul full-span">
                  Cadastrar
                </button>
              </form>
            </div>

            <div className="card">
              <h4>Pesquisar usuários</h4>
              <input
                className="input-full"
                type="text"
                placeholder="Digite um nome..."
                value={buscaUsuario}
                onChange={(e) => setBuscaUsuario(e.target.value)}
              />
            </div>

            {/* Alunos */}
            <UserTable
              titulo="Alunos"
              columns={["Nome", "Série/Sala", "Senha", "Ações"]}
              renderRow={(u) => (
                <>
                  <td>{u.nome}</td>
                  <td>{formatSerieSala(u)}</td>
                  <SenhaCell
                    u={u}
                    editingId={editingId}
                    novaSenha={novaSenha}
                    setNovaSenha={setNovaSenha}
                    startEdit={startEdit}
                    salvarSenha={salvarSenha}
                  />
                  <td className="td-actions">
                    <button
                      className="btn-vermelho"
                      onClick={() => excluirUsuario(u)}
                      title="Excluir usuário"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </>
              )}
              data={alunos}
              vazio="Nenhum aluno encontrado."
            />

            {/* Funcionários */}
            <UserTable
              titulo="Funcionários"
              columns={["Nome", "Função", "Turno", "Senha", "Ações"]}
              renderRow={(u) => (
                <>
                  <td>{u.nome}</td>
                  <td>{u.funcao || "-"}</td>
                  <td>{u.turno || "-"}</td>
                  <SenhaCell
                    u={u}
                    editingId={editingId}
                    novaSenha={novaSenha}
                    setNovaSenha={setNovaSenha}
                    startEdit={startEdit}
                    salvarSenha={salvarSenha}
                  />
                  <td className="td-actions">
                    <button
                      className="btn-vermelho"
                      onClick={() => excluirUsuario(u)}
                      title="Excluir usuário"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </>
              )}
              data={funcionarios}
              vazio="Nenhum funcionário encontrado."
            />

            {/* Bibliotecários */}
            <UserTable
              titulo="Bibliotecários"
              columns={["Nome", "Turno", "Código", "Senha", "Ações"]}
              renderRow={(u) => (
                <>
                  <td>{u.nome}</td>
                  <td>{u.turno || "-"}</td>
                  <td>{u.codigo || "-"}</td>
                  <SenhaCell
                    u={u}
                    editingId={editingId}
                    novaSenha={novaSenha}
                    setNovaSenha={setNovaSenha}
                    startEdit={startEdit}
                    salvarSenha={salvarSenha}
                  />
                  <td className="td-actions">
                    <button
                      className="btn-vermelho"
                      onClick={() => excluirUsuario(u)}
                      title="Excluir usuário"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </>
              )}
              data={bibliotecarios}
              vazio="Nenhum bibliotecário encontrado."
            />
          </div>
        </Tab>

        {/* ===== EMPRÉSTIMOS ===== */}
        <Tab
          eventKey="emprestimos"
          title={
            <>
              <Archive size={16} /> Empréstimos
            </>
          }
        >
          <div className="tab-body">
            {emprestimos.length === 0 ? (
              <p className="vazio">Nenhum empréstimo registrado.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Turma</th>
                    <th>Livro</th>
                    <th>Solicitado</th>
                    <th>Prazo</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {emprestimos.map((e) => (
                    <tr key={e.id}>
                      <td>{e.alunoNome || "—"}</td>
                      <td>{e.alunoSerie} {e.alunoSala}</td>
                      <td>{e.livroTitulo || "—"}</td>
                      <td>
                        {e.dataSolicitacao
                          ? new Date(e.dataSolicitacao).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        {e.prazo
                          ? new Date(e.prazo).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={
                            e.status === "Devolvido"
                              ? "badge verde"
                              : e.status === "Rejeitado"
                              ? "badge vermelho"
                              : isAtrasado(e.prazo)
                              ? "badge vermelho"
                              : e.status === "Emprestado"
                              ? "badge azul"
                              : "badge amarelo"
                          }
                        >
                          {e.status || "Pendente"}
                        </span>
                      </td>
                      <td className="td-actions">
                        {e.status === "Pendente" && (
                          <>
                            <button
                              className="btn-azul"
                              onClick={() => aprovarEmprestimo(e.id)}
                            >
                              Aprovar
                            </button>
                            <button
                              className="btn-danger"
                              onClick={() => rejeitarSolicitacao(e.id)}
                            >
                              Rejeitar
                            </button>
                          </>
                        )}
                        {e.status === "Emprestado" && (
                          <button
                            className="btn-verde"
                            onClick={() => marcarDevolvido(e.id)}
                          >
                            Devolvido
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}

/* ========= Subcomponentes ========= */

function UserTable({ titulo, columns, data, renderRow, vazio }) {
  return (
    <div className="card">
      <h4>{titulo}</h4>
      {data.length === 0 ? (
        <p className="vazio">{vazio}</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>{renderRow(u)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SenhaCell({
  u,
  editingId,
  novaSenha,
  setNovaSenha,
  startEdit,
  salvarSenha,
}) {
  return (
    <td>
      <div className="senha-box">
        <input
          type="password"
          readOnly
          value="********"
          aria-label={`Senha protegida de ${u.nome}`}
        />
      </div>
      <div className="senha-actions">
        {editingId === u.id ? (
          <>
            <input
              type="password"
              placeholder="Nova senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
            />
            <button className="btn-azul" onClick={() => salvarSenha(u)}>
              <CheckCircle size={14} /> Salvar
            </button>
          </>
        ) : (
          <button className="btn-azul" onClick={() => startEdit(u)}>
            Redefinir
          </button>
        )}
      </div>
    </td>
  );
}
