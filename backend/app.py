import importlib.util
import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask_cors import CORS


def _ensure_flask_installed() -> None:
    """Garante que o Flask esteja disponível antes de iniciar a aplicação."""

    if importlib.util.find_spec('flask') is None:
        mensagem = (
            'Flask não está instalado. Execute `pip install -r backend/requirements.txt` '
            'ou `pip install -r requirements.txt` antes de iniciar o servidor.'
        )
        raise SystemExit(mensagem)


_ensure_flask_installed()

from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

try:  # Permite executar como pacote (backend.app) ou script direto.
    from .init_db import criar_banco
except ImportError:  # pragma: no cover - fallback quando executado diretamente
    from init_db import criar_banco

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'chave_super_secreta')

PRAZO_EMPRESTIMO_DIAS = 14


def _truthy(value, default=False):
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'on', 'yes'}


def _parse_origins(raw_value):
    if not raw_value:
        return []
    return [origin.strip().rstrip('/') for origin in raw_value.split(',') if origin.strip()]


default_origins = ['http://localhost:5173']
configured_origins = _parse_origins(os.environ.get('FRONTEND_ORIGIN'))
frontend_origins = configured_origins or default_origins

CORS(
    app,
    origins=frontend_origins,
    supports_credentials=True,
    allow_headers=['Content-Type'],
)

enable_cross_site_cookies = _truthy(
    os.environ.get('ENABLE_CROSS_SITE_COOKIES'),
    default=any(origin.startswith('https://') for origin in frontend_origins),
)

if enable_cross_site_cookies:
    app.config['SESSION_COOKIE_SAMESITE'] = os.environ.get(
        'SESSION_COOKIE_SAMESITE',
        'None',
    )
    app.config['SESSION_COOKIE_SECURE'] = _truthy(
        os.environ.get('SESSION_COOKIE_SECURE'),
        default=True,
    )
else:
    app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Lax')
    app.config.setdefault('SESSION_COOKIE_SECURE', False)

DB = os.environ.get('DATABASE_PATH', 'biblioteca.db')
if Path(DB).parent != Path('.'):
    Path(DB).parent.mkdir(parents=True, exist_ok=True)


def _ensure_schema():
    try:
        criar_banco(DB)
    except Exception as exc:  # pragma: no cover - log and continue
        raise SystemExit(f'Falha ao preparar o banco de dados: {exc}')


_ensure_schema()


def conectar():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def login_obrigatorio(func):
    """Decorator que bloqueia o acesso a rotas administrativas sem sessão ativa."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'bibliotecario_id' not in session:
            return jsonify({'erro': 'Não autorizado'}), 403
        return func(*args, **kwargs)

    return wrapper


def row_to_livro(row):
    return {
        'id': row['id'],
        'titulo': row['titulo'],
        'autor': row['autor'] or '',
        'genero': row['genero'] or '',
        'quantidade': row['quantidade'] if row['quantidade'] is not None else 0,
        'capa': row['capa'] or '',
        'ano': row['ano'],
    }


def row_to_aluno(row):
    # A senha NUNCA é incluída na resposta — fica apenas armazenada (com hash) no banco.
    return {
        'id': row['id'],
        'nomeCompleto': row['nome_completo'],
        'serie': row['serie'],
        'sala': row['sala'],
    }


def row_to_bibliotecario(row):
    return {
        'id': row['id'],
        'nomeCompleto': row['nome_completo'],
        'codigo': row['codigo'],
        'turno': (row['turno'] if 'turno' in row.keys() else None) or '',
    }


def row_to_emprestimo(row):
    return {
        'id': row['id'],
        'livroId': row['livro_id'],
        'alunoId': row['aluno_id'],
        'status': row['status'],
        'dataSolicitacao': row['data_solicitacao'],
        'dataEmprestimo': row['data_emprestimo'],
        'prazo': row['prazo'],
        'dataDevolucao': row['data_devolucao'],
        'livroTitulo': row['titulo'] if 'titulo' in row.keys() else None,
        'livroCapa': row['capa'] if 'capa' in row.keys() else None,
        'alunoNome': row['nome_completo'] if 'nome_completo' in row.keys() else None,
        'alunoSerie': row['serie'] if 'serie' in row.keys() else None,
        'alunoSala': row['sala'] if 'sala' in row.keys() else None,
    }


@app.route('/')
def index():
    if app.static_folder:
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return app.send_static_file('index.html')

    mensagem = (
        'Frontend não encontrado. Execute `npm run dev` para desenvolvimento '
        'ou `npm run build` para gerar os arquivos estáticos.'
    )
    return mensagem, 503, {'Content-Type': 'text/plain; charset=utf-8'}


@app.route('/api/bibliotecario/login', methods=['POST'])
def login_bibliotecario():
    data = request.get_json() or {}
    nome = (data.get('nomeCompleto') or '').strip()
    codigo = (data.get('codigo') or '').strip()
    senha = data.get('senha') or ''

    if not nome or not codigo or not senha:
        return jsonify({'erro': 'Nome completo, código e senha são obrigatórios.'}), 400

    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT id, nome_completo, codigo, senha
        FROM bibliotecarios
        WHERE lower(nome_completo) = lower(?)
          AND codigo = ?
        ''',
        (nome, codigo),
    )
    row = cur.fetchone()
    conn.close()

    if not row or not check_password_hash(row['senha'], senha):
        return jsonify({'erro': 'Bibliotecário não encontrado ou dados inválidos.'}), 401

    session['bibliotecario_id'] = row['id']
    session['bibliotecario_nome'] = row['nome_completo']

    return jsonify(
        {
            'mensagem': 'Login realizado com sucesso!',
            'bibliotecario': {
                'id': row['id'],
                'nomeCompleto': row['nome_completo'],
                'codigo': row['codigo'],
            },
        }
    )


@login_obrigatorio
def _listar_alunos():
    busca = (request.args.get('busca') or '').strip().lower()

    conn = conectar()
    cur = conn.cursor()

    if busca:
        like_term = f'%{busca}%'
        cur.execute(
            '''
            SELECT id, nome_completo, serie, sala
            FROM alunos
            WHERE lower(nome_completo) LIKE ?
            ORDER BY nome_completo COLLATE NOCASE
            ''',
            (like_term,),
        )
    else:
        cur.execute(
            '''
            SELECT id, nome_completo, serie, sala
            FROM alunos
            ORDER BY nome_completo COLLATE NOCASE
            '''
        )

    alunos = [row_to_aluno(row) for row in cur.fetchall()]
    conn.close()
    return jsonify(alunos)


def _cadastrar_aluno():
    data = request.get_json() or {}
    nome = (data.get('nomeCompleto') or '').strip()
    serie = (data.get('serie') or '').strip()
    sala = (data.get('sala') or '').strip()
    senha = data.get('senha') or ''

    if not nome or not serie or not sala or not senha:
        return jsonify({'erro': 'Nome, série, sala e senha são obrigatórios.'}), 400
    if len(senha) < 4:
        return jsonify({'erro': 'A senha deve ter pelo menos 4 caracteres.'}), 400

    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT id
        FROM alunos
        WHERE lower(nome_completo) = lower(?)
          AND serie = ?
          AND sala = ?
        ''',
        (nome, serie, sala),
    )
    if cur.fetchone():
        conn.close()
        return jsonify({'erro': 'Aluno já cadastrado para esta turma.'}), 409

    cur.execute(
        '''
        INSERT INTO alunos (nome_completo, serie, sala, senha)
        VALUES (?, ?, ?, ?)
        ''',
        (nome, serie, sala, generate_password_hash(senha)),
    )
    aluno_id = cur.lastrowid
    conn.commit()

    cur.execute(
        'SELECT id, nome_completo, serie, sala FROM alunos WHERE id = ?',
        (aluno_id,),
    )
    aluno = cur.fetchone()
    conn.close()

    return (
        jsonify(
            {
                'mensagem': 'Aluno cadastrado com sucesso!',
                'aluno': row_to_aluno(aluno),
            }
        ),
        201,
    )


@app.route('/api/alunos', methods=['GET', 'POST'])
def gerenciar_alunos():
    if request.method == 'POST':
        return _cadastrar_aluno()
    return _listar_alunos()


@app.route('/api/alunos/<int:aluno_id>', methods=['PUT'])
@login_obrigatorio
def atualizar_aluno(aluno_id):
    data = request.get_json() or {}
    campos = {}

    if 'nomeCompleto' in data:
        nome = (data.get('nomeCompleto') or '').strip()
        if not nome:
            return jsonify({'erro': 'Nome completo é obrigatório.'}), 400
        campos['nome_completo'] = nome

    if 'serie' in data:
        serie = (data.get('serie') or '').strip()
        if not serie:
            return jsonify({'erro': 'Série é obrigatória.'}), 400
        campos['serie'] = serie

    if 'sala' in data:
        sala = (data.get('sala') or '').strip()
        if not sala:
            return jsonify({'erro': 'Sala é obrigatória.'}), 400
        campos['sala'] = sala

    if 'senha' in data:
        senha = data.get('senha') or ''
        if len(senha) < 4:
            return jsonify({'erro': 'A senha deve ter pelo menos 4 caracteres.'}), 400
        campos['senha'] = generate_password_hash(senha)

    if not campos:
        return jsonify({'erro': 'Nenhum dado para atualizar.'}), 400

    conn = conectar()
    cur = conn.cursor()

    cur.execute('SELECT id FROM alunos WHERE id = ?', (aluno_id,))
    if cur.fetchone() is None:
        conn.close()
        return jsonify({'erro': 'Aluno não encontrado.'}), 404

    updates = ', '.join(f"{col} = ?" for col in campos)
    cur.execute(
        f'UPDATE alunos SET {updates} WHERE id = ?',
        (*campos.values(), aluno_id),
    )
    conn.commit()

    cur.execute(
        'SELECT id, nome_completo, serie, sala FROM alunos WHERE id = ?',
        (aluno_id,),
    )
    aluno = cur.fetchone()
    conn.close()

    if aluno is None:
        return jsonify({'erro': 'Aluno não encontrado.'}), 404

    return jsonify({'mensagem': 'Aluno atualizado com sucesso!', 'aluno': row_to_aluno(aluno)})


@app.route('/api/alunos/<int:aluno_id>', methods=['DELETE'])
@login_obrigatorio
def excluir_aluno(aluno_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute('DELETE FROM alunos WHERE id = ?', (aluno_id,))

    if cur.rowcount == 0:
        conn.close()
        return jsonify({'erro': 'Aluno não encontrado.'}), 404

    conn.commit()
    conn.close()
    return jsonify({'mensagem': 'Aluno removido com sucesso!'})


@app.route('/api/alunos/login', methods=['POST'])
def login_aluno():
    data = request.get_json() or {}
    nome = (data.get('nomeCompleto') or '').strip()
    senha = data.get('senha') or ''

    if not nome or not senha:
        return jsonify({'erro': 'Nome completo e senha são obrigatórios.'}), 400

    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT id, nome_completo, serie, sala, senha
        FROM alunos
        WHERE lower(nome_completo) = lower(?)
        ''',
        (nome,),
    )
    aluno = cur.fetchone()
    conn.close()

    if not aluno or not check_password_hash(aluno['senha'], senha):
        return jsonify({'erro': 'Aluno não encontrado ou senha incorreta.'}), 401

    return jsonify(row_to_aluno(aluno))


@login_obrigatorio
def _listar_bibliotecarios():
    busca = (request.args.get('busca') or '').strip().lower()

    conn = conectar()
    cur = conn.cursor()

    if busca:
        like_term = f'%{busca}%'
        cur.execute(
            '''
            SELECT id, nome_completo, codigo, turno
            FROM bibliotecarios
            WHERE lower(nome_completo) LIKE ? OR lower(codigo) LIKE ?
            ORDER BY nome_completo COLLATE NOCASE
            ''',
            (like_term, like_term),
        )
    else:
        cur.execute(
            '''
            SELECT id, nome_completo, codigo, turno
            FROM bibliotecarios
            ORDER BY nome_completo COLLATE NOCASE
            '''
        )

    bibliotecarios = [row_to_bibliotecario(row) for row in cur.fetchall()]
    conn.close()
    return jsonify(bibliotecarios)


@login_obrigatorio
def _cadastrar_bibliotecario():
    data = request.get_json() or {}
    nome = (data.get('nomeCompleto') or '').strip()
    codigo = (data.get('codigo') or '').strip()
    senha = (data.get('senha') or '').strip()
    turno = (data.get('turno') or '').strip() or None

    if not nome or not codigo or not senha:
        return jsonify({'erro': 'Nome completo, código e senha são obrigatórios.'}), 400
    if len(senha) < 4:
        return jsonify({'erro': 'A senha deve ter pelo menos 4 caracteres.'}), 400

    conn = conectar()
    cur = conn.cursor()

    cur.execute(
        'SELECT id FROM bibliotecarios WHERE codigo = ?',
        (codigo,),
    )
    if cur.fetchone():
        conn.close()
        return jsonify({'erro': 'Já existe um bibliotecário cadastrado com esse código.'}), 409

    cur.execute(
        '''
        INSERT INTO bibliotecarios (nome_completo, codigo, senha, turno)
        VALUES (?, ?, ?, ?)
        ''',
        (nome, codigo, generate_password_hash(senha), turno),
    )
    bibliotecario_id = cur.lastrowid
    conn.commit()

    cur.execute(
        'SELECT id, nome_completo, codigo, turno FROM bibliotecarios WHERE id = ?',
        (bibliotecario_id,),
    )
    row = cur.fetchone()
    conn.close()

    return (
        jsonify(
            {
                'mensagem': 'Bibliotecário cadastrado com sucesso!',
                'bibliotecario': row_to_bibliotecario(row),
            }
        ),
        201,
    )


@login_obrigatorio
def _atualizar_bibliotecario(bibliotecario_id):
    data = request.get_json() or {}
    campos = {}

    if 'nomeCompleto' in data:
        nome = (data.get('nomeCompleto') or '').strip()
        if not nome:
            return jsonify({'erro': 'Nome completo é obrigatório.'}), 400
        campos['nome_completo'] = nome

    if 'codigo' in data:
        codigo = (data.get('codigo') or '').strip()
        if not codigo:
            return jsonify({'erro': 'Código é obrigatório.'}), 400
        campos['codigo'] = codigo

    if 'senha' in data:
        senha = (data.get('senha') or '').strip()
        if len(senha) < 4:
            return jsonify({'erro': 'A senha deve ter pelo menos 4 caracteres.'}), 400
        campos['senha'] = generate_password_hash(senha)

    if 'turno' in data:
        turno = (data.get('turno') or '').strip()
        campos['turno'] = turno or None

    if not campos:
        return jsonify({'erro': 'Nenhum dado para atualizar.'}), 400

    conn = conectar()
    cur = conn.cursor()

    cur.execute('SELECT id FROM bibliotecarios WHERE id = ?', (bibliotecario_id,))
    if cur.fetchone() is None:
        conn.close()
        return jsonify({'erro': 'Bibliotecário não encontrado.'}), 404

    if 'codigo' in campos:
        cur.execute(
            'SELECT id FROM bibliotecarios WHERE codigo = ? AND id != ?',
            (campos['codigo'], bibliotecario_id),
        )
        if cur.fetchone() is not None:
            conn.close()
            return jsonify({'erro': 'Já existe um bibliotecário cadastrado com esse código.'}), 409

    updates = ', '.join(f"{col} = ?" for col in campos)
    cur.execute(
        f'UPDATE bibliotecarios SET {updates} WHERE id = ?',
        (*campos.values(), bibliotecario_id),
    )
    conn.commit()

    cur.execute(
        'SELECT id, nome_completo, codigo, turno FROM bibliotecarios WHERE id = ?',
        (bibliotecario_id,),
    )
    row = cur.fetchone()
    conn.close()

    if row is None:
        return jsonify({'erro': 'Bibliotecário não encontrado.'}), 404

    return jsonify(
        {
            'mensagem': 'Bibliotecário atualizado com sucesso!',
            'bibliotecario': row_to_bibliotecario(row),
        }
    )


@login_obrigatorio
def _excluir_bibliotecario(bibliotecario_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute('DELETE FROM bibliotecarios WHERE id = ?', (bibliotecario_id,))

    if cur.rowcount == 0:
        conn.close()
        return jsonify({'erro': 'Bibliotecário não encontrado.'}), 404

    conn.commit()
    conn.close()
    return jsonify({'mensagem': 'Bibliotecário removido com sucesso!'})


@app.route('/api/bibliotecarios', methods=['GET', 'POST'])
def gerenciar_bibliotecarios():
    if request.method == 'POST':
        return _cadastrar_bibliotecario()
    return _listar_bibliotecarios()


@app.route('/api/bibliotecarios/<int:bibliotecario_id>', methods=['PUT', 'DELETE'])
def modificar_bibliotecario(bibliotecario_id):
    if request.method == 'PUT':
        return _atualizar_bibliotecario(bibliotecario_id)
    return _excluir_bibliotecario(bibliotecario_id)


@app.route('/logout', methods=['POST'])
def logout():
    session.pop('bibliotecario_id', None)
    session.pop('bibliotecario_nome', None)
    return jsonify({'mensagem': 'Logout realizado'})


@app.route('/api/livros', methods=['GET'])
def listar_livros():
    busca = request.args.get('busca', '').strip()
    conn = conectar()
    cur = conn.cursor()

    if busca:
        like_term = f'%{busca}%'
        cur.execute(
            """
            SELECT id, titulo, autor, genero, quantidade, capa, ano
            FROM livros
            WHERE titulo LIKE ? OR autor LIKE ?
            ORDER BY titulo COLLATE NOCASE
            """,
            (like_term, like_term),
        )
    else:
        cur.execute(
            """
            SELECT id, titulo, autor, genero, quantidade, capa, ano
            FROM livros
            ORDER BY titulo COLLATE NOCASE
            """
        )

    livros = [row_to_livro(row) for row in cur.fetchall()]
    conn.close()
    return jsonify(livros)


@app.route('/api/livros', methods=['POST'])
@login_obrigatorio
def adicionar_livro():
    data = request.get_json() or {}
    titulo = (data.get('titulo') or '').strip()
    if not titulo:
        return jsonify({'erro': 'Título é obrigatório'}), 400

    autor = (data.get('autor') or '').strip()
    genero = (data.get('genero') or '').strip()
    capa = (data.get('capa') or '').strip()
    ano = data.get('ano')
    ano_int = None
    if ano not in (None, ''):
        try:
            ano_int = int(ano)
        except (TypeError, ValueError):
            return jsonify({'erro': 'Ano inválido'}), 400

    quantidade = data.get('quantidade', 0)
    try:
        quantidade_int = int(quantidade)
    except (TypeError, ValueError):
        return jsonify({'erro': 'Quantidade inválida'}), 400

    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO livros (titulo, autor, genero, quantidade, capa, ano)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (titulo, autor, genero, quantidade_int, capa, ano_int),
    )
    novo_id = cur.lastrowid
    conn.commit()

    cur.execute(
        "SELECT id, titulo, autor, genero, quantidade, capa, ano FROM livros WHERE id = ?",
        (novo_id,),
    )
    livro = cur.fetchone()
    conn.close()

    return (
        jsonify({'mensagem': 'Livro adicionado com sucesso!', 'livro': row_to_livro(livro)}),
        201,
    )


@app.route('/api/livros/<int:livro_id>', methods=['PUT'])
@login_obrigatorio
def atualizar_livro(livro_id):
    data = request.get_json() or {}
    campos_validos = {
        'titulo': lambda v: (v or '').strip(),
        'autor': lambda v: (v or '').strip(),
        'genero': lambda v: (v or '').strip(),
        'capa': lambda v: (v or '').strip(),
        'ano': lambda v: v,
        'quantidade': lambda v: v,
    }

    updates = []
    valores = []

    for campo, normalizer in campos_validos.items():
        if campo not in data:
            continue
        valor = normalizer(data.get(campo))
        if campo == 'ano':
            if valor in (None, ''):
                valor = None
            else:
                try:
                    valor = int(valor)
                except (TypeError, ValueError):
                    return jsonify({'erro': 'Ano inválido'}), 400
        if campo == 'quantidade':
            try:
                valor = int(valor)
            except (TypeError, ValueError):
                return jsonify({'erro': 'Quantidade inválida'}), 400
        updates.append(f"{campo} = ?")
        valores.append(valor)

    if not updates:
        return jsonify({'erro': 'Nenhum dado para atualizar'}), 400

    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE livros SET {', '.join(updates)} WHERE id = ?",
        (*valores, livro_id),
    )

    if cur.rowcount == 0:
        conn.close()
        return jsonify({'erro': 'Livro não encontrado'}), 404

    conn.commit()
    cur.execute(
        "SELECT id, titulo, autor, genero, quantidade, capa, ano FROM livros WHERE id = ?",
        (livro_id,),
    )
    livro = cur.fetchone()
    conn.close()

    return jsonify({'mensagem': 'Livro atualizado com sucesso!', 'livro': row_to_livro(livro)})


@app.route('/api/livros/<int:livro_id>', methods=['DELETE'])
@login_obrigatorio
def excluir_livro(livro_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute("DELETE FROM livros WHERE id = ?", (livro_id,))
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'erro': 'Livro não encontrado'}), 404

    conn.commit()
    conn.close()
    return jsonify({'mensagem': 'Livro removido com sucesso!'})


# ===================== EMPRÉSTIMOS =====================

EMPRESTIMO_SELECT = """
    SELECT e.id, e.livro_id, e.aluno_id, e.status, e.data_solicitacao,
           e.data_emprestimo, e.prazo, e.data_devolucao,
           l.titulo, l.capa,
           a.nome_completo, a.serie, a.sala
    FROM emprestimos e
    JOIN livros l ON l.id = e.livro_id
    JOIN alunos a ON a.id = e.aluno_id
"""


@app.route('/api/emprestimos', methods=['GET'])
@login_obrigatorio
def listar_emprestimos():
    """Lista todos os empréstimos. Use ?status=Pendente para filtrar."""
    status = (request.args.get('status') or '').strip()

    conn = conectar()
    cur = conn.cursor()
    if status:
        cur.execute(
            EMPRESTIMO_SELECT + ' WHERE e.status = ? ORDER BY e.data_solicitacao DESC',
            (status,),
        )
    else:
        cur.execute(EMPRESTIMO_SELECT + ' ORDER BY e.data_solicitacao DESC')

    emprestimos = [row_to_emprestimo(row) for row in cur.fetchall()]
    conn.close()
    return jsonify(emprestimos)


@app.route('/api/alunos/<int:aluno_id>/emprestimos', methods=['GET'])
def listar_emprestimos_do_aluno(aluno_id):
    """Rota usada pelo próprio aluno para ver seus pedidos/empréstimos."""
    conn = conectar()
    cur = conn.cursor()
    cur.execute(
        EMPRESTIMO_SELECT + ' WHERE e.aluno_id = ? ORDER BY e.data_solicitacao DESC',
        (aluno_id,),
    )
    emprestimos = [row_to_emprestimo(row) for row in cur.fetchall()]
    conn.close()
    return jsonify(emprestimos)


@app.route('/api/emprestimos', methods=['POST'])
def solicitar_emprestimo():
    """O aluno solicita o empréstimo de um livro disponível."""
    data = request.get_json() or {}
    livro_id = data.get('livroId')
    aluno_id = data.get('alunoId')

    if not livro_id or not aluno_id:
        return jsonify({'erro': 'livroId e alunoId são obrigatórios.'}), 400

    conn = conectar()
    cur = conn.cursor()

    cur.execute('SELECT id, quantidade FROM livros WHERE id = ?', (livro_id,))
    livro = cur.fetchone()
    if not livro:
        conn.close()
        return jsonify({'erro': 'Livro não encontrado.'}), 404
    if (livro['quantidade'] or 0) <= 0:
        conn.close()
        return jsonify({'erro': 'Livro indisponível no momento.'}), 409

    cur.execute('SELECT id FROM alunos WHERE id = ?', (aluno_id,))
    if not cur.fetchone():
        conn.close()
        return jsonify({'erro': 'Aluno não encontrado.'}), 404

    cur.execute(
        '''
        SELECT id FROM emprestimos
        WHERE livro_id = ? AND aluno_id = ? AND status IN ('Pendente', 'Emprestado')
        ''',
        (livro_id, aluno_id),
    )
    if cur.fetchone():
        conn.close()
        return jsonify({'erro': 'Você já tem uma solicitação em andamento para este livro.'}), 409

    agora = datetime.utcnow().isoformat(timespec='seconds')
    cur.execute(
        '''
        INSERT INTO emprestimos (livro_id, aluno_id, status, data_solicitacao)
        VALUES (?, ?, 'Pendente', ?)
        ''',
        (livro_id, aluno_id, agora),
    )
    emprestimo_id = cur.lastrowid
    conn.commit()

    cur.execute(EMPRESTIMO_SELECT + ' WHERE e.id = ?', (emprestimo_id,))
    emprestimo = cur.fetchone()
    conn.close()

    return (
        jsonify({'mensagem': 'Solicitação enviada!', 'emprestimo': row_to_emprestimo(emprestimo)}),
        201,
    )


@app.route('/api/emprestimos/<int:emprestimo_id>/aprovar', methods=['PUT'])
@login_obrigatorio
def aprovar_emprestimo(emprestimo_id):
    conn = conectar()
    cur = conn.cursor()

    cur.execute('SELECT * FROM emprestimos WHERE id = ?', (emprestimo_id,))
    emprestimo = cur.fetchone()
    if not emprestimo:
        conn.close()
        return jsonify({'erro': 'Empréstimo não encontrado.'}), 404
    if emprestimo['status'] != 'Pendente':
        conn.close()
        return jsonify({'erro': 'Apenas solicitações pendentes podem ser aprovadas.'}), 409

    cur.execute('SELECT quantidade FROM livros WHERE id = ?', (emprestimo['livro_id'],))
    livro = cur.fetchone()
    if not livro or (livro['quantidade'] or 0) <= 0:
        conn.close()
        return jsonify({'erro': 'Livro indisponível no momento.'}), 409

    hoje = datetime.utcnow()
    prazo = (hoje + timedelta(days=PRAZO_EMPRESTIMO_DIAS)).date().isoformat()

    cur.execute(
        '''
        UPDATE emprestimos
        SET status = 'Emprestado', data_emprestimo = ?, prazo = ?
        WHERE id = ?
        ''',
        (hoje.date().isoformat(), prazo, emprestimo_id),
    )
    cur.execute(
        'UPDATE livros SET quantidade = quantidade - 1 WHERE id = ?',
        (emprestimo['livro_id'],),
    )
    conn.commit()

    cur.execute(EMPRESTIMO_SELECT + ' WHERE e.id = ?', (emprestimo_id,))
    row = cur.fetchone()
    conn.close()
    return jsonify({'mensagem': 'Empréstimo aprovado!', 'emprestimo': row_to_emprestimo(row)})


@app.route('/api/emprestimos/<int:emprestimo_id>/rejeitar', methods=['PUT'])
@login_obrigatorio
def rejeitar_emprestimo(emprestimo_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute('SELECT status FROM emprestimos WHERE id = ?', (emprestimo_id,))
    emprestimo = cur.fetchone()
    if not emprestimo:
        conn.close()
        return jsonify({'erro': 'Empréstimo não encontrado.'}), 404
    if emprestimo['status'] != 'Pendente':
        conn.close()
        return jsonify({'erro': 'Apenas solicitações pendentes podem ser rejeitadas.'}), 409

    cur.execute("UPDATE emprestimos SET status = 'Rejeitado' WHERE id = ?", (emprestimo_id,))
    conn.commit()

    cur.execute(EMPRESTIMO_SELECT + ' WHERE e.id = ?', (emprestimo_id,))
    row = cur.fetchone()
    conn.close()
    return jsonify({'mensagem': 'Solicitação rejeitada.', 'emprestimo': row_to_emprestimo(row)})


@app.route('/api/emprestimos/<int:emprestimo_id>/devolver', methods=['PUT'])
@login_obrigatorio
def devolver_emprestimo(emprestimo_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute('SELECT * FROM emprestimos WHERE id = ?', (emprestimo_id,))
    emprestimo = cur.fetchone()
    if not emprestimo:
        conn.close()
        return jsonify({'erro': 'Empréstimo não encontrado.'}), 404
    if emprestimo['status'] != 'Emprestado':
        conn.close()
        return jsonify({'erro': 'Apenas empréstimos ativos podem ser devolvidos.'}), 409

    hoje = datetime.utcnow().date().isoformat()
    cur.execute(
        "UPDATE emprestimos SET status = 'Devolvido', data_devolucao = ? WHERE id = ?",
        (hoje, emprestimo_id),
    )
    cur.execute(
        'UPDATE livros SET quantidade = quantidade + 1 WHERE id = ?',
        (emprestimo['livro_id'],),
    )
    conn.commit()

    cur.execute(EMPRESTIMO_SELECT + ' WHERE e.id = ?', (emprestimo_id,))
    row = cur.fetchone()
    conn.close()
    return jsonify({'mensagem': 'Devolução registrada!', 'emprestimo': row_to_emprestimo(row)})


@app.route('/api/emprestimos/<int:emprestimo_id>', methods=['DELETE'])
@login_obrigatorio
def excluir_emprestimo(emprestimo_id):
    conn = conectar()
    cur = conn.cursor()
    cur.execute("DELETE FROM emprestimos WHERE id = ? AND status IN ('Pendente', 'Rejeitado', 'Devolvido')", (emprestimo_id,))
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'erro': 'Empréstimo não encontrado ou não pode ser removido.'}), 404
    conn.commit()
    conn.close()
    return jsonify({'mensagem': 'Registro removido.'})


if __name__ == '__main__':
    if not os.path.exists(DB):
        print('Banco não encontrado. Criando automaticamente...')
        from init_db import criar_banco

        criar_banco()
    app.run(debug=True)
