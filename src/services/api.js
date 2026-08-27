const JSON_CONTENT = "application/json";

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function resolvePath(path) {
  if (!API_BASE) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };

  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
    options.headers['Content-Type'] = JSON_CONTENT;
  }

  const response = await fetch(resolvePath(path), options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes(JSON_CONTENT);
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (payload && (payload.erro || payload.mensagem)) ||
      (typeof payload === 'string' && payload) ||
      'Erro desconhecido';
    throw new Error(message);
  }

  return payload;
}

export async function loginBibliotecario(nomeCompleto, codigo, senha) {
  return request('/api/bibliotecario/login', {
    method: 'POST',
    body: { nomeCompleto, codigo, senha },
  });
}

export async function logoutBibliotecario() {
  return request('/logout', { method: 'POST' });
}

export async function fetchBooks(busca = '') {
  const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  return request(`/api/livros${query}`);
}

export async function createBook(dados) {
  return request('/api/livros', {
    method: 'POST',
    body: dados,
  });
}

export async function updateBook(id, dados) {
  return request(`/api/livros/${id}`, {
    method: 'PUT',
    body: dados,
  });
}

export async function deleteBook(id) {
  return request(`/api/livros/${id}`, {
    method: 'DELETE',
  });
}

export async function registerStudent({ nomeCompleto, serie, sala, senha }) {
  return request('/api/alunos', {
    method: 'POST',
    body: { nomeCompleto, serie, sala, senha },
  });
}

export async function loginStudent(nomeCompleto, senha) {
  return request('/api/alunos/login', {
    method: 'POST',
    body: { nomeCompleto, senha },
  });
}

export async function fetchStudents(busca = '') {
  const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  return request(`/api/alunos${query}`);
}

export async function updateStudent(id, dados) {
  return request(`/api/alunos/${id}`, {
    method: 'PUT',
    body: dados,
  });
}

export async function deleteStudent(id) {
  return request(`/api/alunos/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchLibrarians(busca = '') {
  const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  return request(`/api/bibliotecarios${query}`);
}

export async function createLibrarian(dados) {
  return request('/api/bibliotecarios', {
    method: 'POST',
    body: dados,
  });
}

export async function updateLibrarian(id, dados) {
  return request(`/api/bibliotecarios/${id}`, {
    method: 'PUT',
    body: dados,
  });
}

export async function deleteLibrarian(id) {
  return request(`/api/bibliotecarios/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchEmprestimos(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/emprestimos${query}`);
}

export async function fetchEmprestimosDoAluno(alunoId) {
  return request(`/api/alunos/${alunoId}/emprestimos`);
}

export async function solicitarEmprestimo(livroId, alunoId) {
  return request('/api/emprestimos', {
    method: 'POST',
    body: { livroId, alunoId },
  });
}

export async function aprovarEmprestimo(id) {
  return request(`/api/emprestimos/${id}/aprovar`, { method: 'PUT' });
}

export async function rejeitarEmprestimo(id) {
  return request(`/api/emprestimos/${id}/rejeitar`, { method: 'PUT' });
}

export async function devolverEmprestimo(id) {
  return request(`/api/emprestimos/${id}/devolver`, { method: 'PUT' });
}

export async function excluirEmprestimo(id) {
  return request(`/api/emprestimos/${id}`, { method: 'DELETE' });
}
