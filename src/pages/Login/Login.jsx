import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./Login.css";
import {
  loginBibliotecario,
  registerStudent,
  loginStudent,
} from "../../services/api";

export default function Login() {
  const [modo, setModo] = useState("login");
  const [tipo, setTipo] = useState("aluno");
  const [nome, setNome] = useState("");
  const [serie, setSerie] = useState("");
  const [sala, setSala] = useState("");
  const [funcao, setFuncao] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const navigate = useNavigate();

  const funcoes = [
    "Professor",
    "Diretoria",
    "Coordenação",
    "Secretaria",
    "Auxiliar",
  ];
  const series = ["6º", "7º", "8º", "9º", "1º", "2º", "3º", "EJA"];
  const salas = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  useEffect(() => {
    if (tipo !== "aluno") {
      setSerie("");
      setSala("");
    }
    if (tipo !== "funcionario") {
      setFuncao("");
    }
    if (tipo !== "bibliotecario") {
      setCodigo("");
    } else {
      setModo("login");
    }
  }, [tipo]);

  function validarNomeCompleto(nomeAtual, tipoAtual = tipo) {
    if (tipoAtual === "bibliotecario") {
      return nomeAtual.trim().length > 0;
    }
    return nomeAtual.trim().split(" ").length >= 2;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validarNomeCompleto(nome, tipo))
      return alert("Digite o nome completo.");
    if (!senha || senha.length < 4)
      return alert("A senha deve ter pelo menos 4 caracteres.");

    const nomeFormatado = nome.trim();
    const nomeLower = nomeFormatado.toLowerCase();
    const codigoFormatado = codigo.trim();

    const key = "leiasj_users_v1";
    const users = JSON.parse(localStorage.getItem(key)) || [];

    if (modo === "cadastro") {
      if (tipo === "bibliotecario") {
        alert("Somente administradores podem cadastrar bibliotecários.");
        return;
      }
      if (tipo === "aluno") {
        if (!serie || !sala)
          return alert("Selecione a série e a sala do aluno.");

        try {
          const cadastro = await registerStudent({
            nomeCompleto: nomeFormatado,
            serie,
            sala,
            senha,
          });
          const alunoCadastrado = cadastro?.aluno || null;
          const nomeAluno = alunoCadastrado?.nomeCompleto ?? nomeFormatado;
          const serieAluno = alunoCadastrado?.serie ?? serie;
          const salaAluno = alunoCadastrado?.sala ?? sala;
          const novoAluno = {
            id: alunoCadastrado?.id ?? Date.now(),
            nome: nomeAluno,
            tipo: "aluno",
            senha,
            serie: serieAluno,
            sala: salaAluno,
            funcao: "",
            codigo: "",
          };
          const nextUsers = [
            ...users.filter(
              (u) =>
                !(
                  u.tipo === "aluno" &&
                  (u.nome || "").toLowerCase() === nomeAluno.toLowerCase()
                )
            ),
            novoAluno,
          ];
          localStorage.setItem(key, JSON.stringify(nextUsers));
          alert(cadastro?.mensagem || "Cadastro realizado!");
          setModo("login");
        } catch (error) {
          alert(error.message || "Falha ao cadastrar aluno.");
        }
        return;
      }

      const existe = users.find(
        (u) => (u.nome || "").toLowerCase() === nomeLower && u.tipo === tipo
      );
      if (existe) return alert("Usuário já cadastrado.");

      const novo = {
        id: Date.now(),
        nome: nomeFormatado,
        tipo,
        senha,
        serie: "",
        sala: "",
        funcao,
        codigo: codigoFormatado,
      };
      const nextUsers = [...users, novo];
      localStorage.setItem(key, JSON.stringify(nextUsers));
      alert("Cadastro realizado!");
      setModo("login");
      return;
    }

    if (tipo === "bibliotecario") {
      if (!codigoFormatado)
        return alert("Informe o código do bibliotecário.");

      let resposta;
      try {
        resposta = await loginBibliotecario(
          nomeFormatado,
          codigoFormatado,
          senha
        );
      } catch (error) {
        return alert(error.message || "Falha ao realizar login.");
      }

      const bibliotecarioDados = resposta?.bibliotecario || null;
      const nomeBibliotecario =
        bibliotecarioDados?.nomeCompleto ?? nomeFormatado;
      const codigoBibliotecario =
        bibliotecarioDados?.codigo ?? codigoFormatado;
      const idBibliotecario = bibliotecarioDados?.id ?? Date.now();

      const usuarioBibliotecario = {
        id: idBibliotecario,
        nome: nomeBibliotecario,
        tipo,
        senha,
        serie: "",
        sala: "",
        funcao: "",
        codigo: codigoBibliotecario,
      };

      const nextUsers = [
        ...users.filter(
          (u) =>
            !(
              u.tipo === "bibliotecario" &&
              (u.codigo || "").toLowerCase() ===
                codigoBibliotecario.toLowerCase()
            )
        ),
        usuarioBibliotecario,
      ];
      localStorage.setItem(key, JSON.stringify(nextUsers));
      localStorage.setItem(
        "leiasj_logged_user",
        JSON.stringify(usuarioBibliotecario)
      );
      navigate("/bibliotecario");
      return;
    }

    if (tipo === "aluno") {
      try {
        const aluno = await loginStudent(nomeFormatado, senha);
        const nomeAluno = aluno?.nomeCompleto ?? nomeFormatado;
        const serieAluno = aluno?.serie ?? serie;
        const salaAluno = aluno?.sala ?? sala;
        const usuarioLogado = {
          id: aluno?.id ?? Date.now(),
          nome: nomeAluno,
          tipo: "aluno",
          senha,
          serie: serieAluno,
          sala: salaAluno,
          funcao: "",
          codigo: "",
        };
        const nextUsers = [
          ...users.filter(
            (u) =>
              !(
                u.tipo === "aluno" &&
                (u.nome || "").toLowerCase() === nomeAluno.toLowerCase()
              )
          ),
          usuarioLogado,
        ];
        localStorage.setItem(key, JSON.stringify(nextUsers));
        localStorage.setItem(
          "leiasj_logged_user",
          JSON.stringify(usuarioLogado)
        );
        navigate("/usuario");
      } catch (error) {
        alert(error.message || "Falha ao realizar login.");
      }
      return;
    }

    const user = users.find(
      (u) =>
        (u.nome || "").toLowerCase() === nomeLower &&
        u.senha === senha &&
        u.tipo === tipo
    );
    if (!user) return alert("Usuário ou senha inválidos.");
    localStorage.setItem("leiasj_logged_user", JSON.stringify(user));
    navigate("/usuario");
  }

  return (
    <div className="login-page d-flex align-items-center justify-content-center">
      <div className="card p-4 shadow-lg login-box">
        <div className="text-center mb-3">
          <h2 className="fw-bold text-primary">LeiaSJ</h2>
        </div>

        {/* Botões Entrar / Cadastrar */}
        <div className="btn-group w-100 mb-3" role="group">
          <button
            type="button"
            className={`btn ${modo === "login" ? "ativo" : "btn-outline-warning"}`}
            onClick={() => setModo("login")}
          >
            {tipo === "bibliotecario" ? "Login de bibliotecario" : "Entrar"}
          </button>
          {tipo !== "bibliotecario" && (
            <button
              type="button"
              className={`btn ${
                modo === "cadastro" ? "ativo" : "btn-outline-warning"
              }`}
              onClick={() => setModo("cadastro")}
            >
              Cadastrar
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Tipo de usuário */}
          <div className="mb-3 tipo-user">
            <label>
              <input
                type="radio"
                value="aluno"
                checked={tipo === "aluno"}
                onChange={() => setTipo("aluno")}
              />{" "}
              Aluno
            </label>
            <label>
              <input
                type="radio"
                value="funcionario"
                checked={tipo === "funcionario"}
                onChange={() => setTipo("funcionario")}
              />{" "}
              Funcionário
            </label>
            <label>
              <input
                type="radio"
                value="bibliotecario"
                checked={tipo === "bibliotecario"}
                onChange={() => setTipo("bibliotecario")}
              />{" "}
              Bibliotecário
            </label>
          </div>

          <input
            type="text"
            placeholder="Nome completo"
            className="form-control mb-3"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />

          {/* Campos específicos */}
          {tipo === "aluno" && (
            <div className="mb-3 d-flex justify-content-between gap-2">
              <select
                className="form-select"
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                required={modo === "cadastro"}
              >
                <option value="">Série</option>
                {series.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </select>

              <select
                className="form-select"
                value={sala}
                onChange={(e) => setSala(e.target.value)}
                required={modo === "cadastro"}
              >
                <option value="">Sala</option>
                {salas.map((letra) => (
                  <option key={letra} value={letra}>
                    {letra}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipo === "funcionario" && (
            <select
              className="form-select mb-3"
              value={funcao}
              onChange={(e) => setFuncao(e.target.value)}
              required={modo === "cadastro"}
            >
              <option value="">Selecione a função</option>
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}

          {tipo === "bibliotecario" && (
            <input
              type="text"
              placeholder="Código do bibliotecário"
              className="form-control mb-3"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              required
            />
          )}

          <input
            type="password"
            placeholder="Senha"
            className="form-control mb-3"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />

          <button type="submit" className="btn btn-warning w-100 fw-semibold">
            {modo === "login" ? "Entrar" : "Cadastrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
