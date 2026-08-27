import os
from pathlib import Path
import sqlite3

from werkzeug.security import generate_password_hash

DEFAULT_DB_PATH = 'biblioteca.db'


def _resolve_db_path(db_path=None):
    path = Path(db_path or os.environ.get('DATABASE_PATH') or DEFAULT_DB_PATH)
    if path.parent != Path('.'):
        path.parent.mkdir(parents=True, exist_ok=True)
    return path


def ensure_columns(cursor, table, columns):
    existing = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
    for column, definition in columns:
        if column not in existing:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _is_hashed(senha):
    """Verifica se a senha já está no formato hash do Werkzeug."""
    return isinstance(senha, str) and ('$' in senha) and (
        senha.startswith('pbkdf2:') or senha.startswith('scrypt:')
    )


def _migrar_senhas_para_hash(cur, tabela):
    """Converte senhas antigas em texto puro para hash (upgrade de segurança)."""
    cur.execute(f'SELECT id, senha FROM {tabela}')
    for row_id, senha in cur.fetchall():
        if senha and not _is_hashed(senha):
            cur.execute(
                f'UPDATE {tabela} SET senha = ? WHERE id = ?',
                (generate_password_hash(senha), row_id),
            )


def criar_banco(db_path=None):
    path = _resolve_db_path(db_path)
    conn = sqlite3.connect(path)
    cur = conn.cursor()

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS livros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            autor TEXT,
            genero TEXT,
            quantidade INTEGER DEFAULT 0,
            capa TEXT,
            ano INTEGER
        )
        '''
    )

    ensure_columns(
        cur,
        'livros',
        [
            ('genero', 'TEXT'),
            ('quantidade', 'INTEGER DEFAULT 0'),
            ('capa', 'TEXT'),
            ('ano', 'INTEGER'),
        ],
    )

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS alunos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_completo TEXT NOT NULL,
            serie TEXT NOT NULL,
            sala TEXT NOT NULL,
            senha TEXT NOT NULL
        )
        '''
    )

    ensure_columns(
        cur,
        'alunos',
        [
            ('nome_completo', "TEXT NOT NULL DEFAULT ''"),
            ('serie', "TEXT NOT NULL DEFAULT ''"),
            ('sala', "TEXT NOT NULL DEFAULT ''"),
            ('senha', "TEXT NOT NULL DEFAULT ''"),
        ],
    )

    conn.commit()

    cur.execute('SELECT COUNT(*) FROM livros')
    if cur.fetchone()[0] == 0:
        livros = [
            ("Dom Casmurro", "Machado de Assis", "Romance", 4, "", 1899),
            ("O Alquimista", "Paulo Coelho", "Ficção", 5, "", 1988),
            ("Capitães da Areia", "Jorge Amado", "Romance", 3, "", 1937),
            ("Vidas Secas", "Graciliano Ramos", "Romance", 6, "", 1938),
            (
                "Memórias Póstumas de Brás Cubas",
                "Machado de Assis",
                "Romance",
                2,
                "",
                1881,
            ),
            ("A Hora da Estrela", "Clarice Lispector", "Ficção", 4, "", 1977),
            ("Grande Sertão: Veredas", "Guimarães Rosa", "Romance", 3, "", 1956),
            ("O Cortiço", "Aluísio Azevedo", "Romance", 5, "", 1890),
            ("Iracema", "José de Alencar", "Romance", 2, "", 1865),
            ("A Moreninha", "Joaquim Manuel de Macedo", "Romance", 3, "", 1844),
        ]
        cur.executemany(
            """
            INSERT INTO livros (titulo, autor, genero, quantidade, capa, ano)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            livros,
        )

    cur.execute('DROP TABLE IF EXISTS usuarios')

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS bibliotecarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_completo TEXT NOT NULL,
            codigo TEXT NOT NULL UNIQUE,
            senha TEXT NOT NULL,
            turno TEXT
        )
        '''
    )

    ensure_columns(
        cur,
        'bibliotecarios',
        [
            ('turno', 'TEXT'),
        ],
    )

    cur.execute(
        '''
        SELECT id
        FROM bibliotecarios
        WHERE lower(nome_completo) = lower(?) OR codigo = ?
        ''',
        ("AdmLeia", "LEIA-SJ-2025"),
    )
    if cur.fetchone() is None:
        cur.execute(
            '''
            INSERT INTO bibliotecarios (nome_completo, codigo, senha)
            VALUES (?, ?, ?)
            ''',
            ("AdmLeia", "LEIA-SJ-2025", generate_password_hash("12345")),
        )

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS emprestimos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            livro_id INTEGER NOT NULL,
            aluno_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pendente',
            data_solicitacao TEXT NOT NULL,
            data_emprestimo TEXT,
            prazo TEXT,
            data_devolucao TEXT,
            FOREIGN KEY (livro_id) REFERENCES livros (id),
            FOREIGN KEY (aluno_id) REFERENCES alunos (id)
        )
        '''
    )

    conn.commit()

    # Upgrade de segurança: converte qualquer senha antiga em texto puro para hash
    _migrar_senhas_para_hash(cur, 'alunos')
    _migrar_senhas_para_hash(cur, 'bibliotecarios')
    conn.commit()

    conn.close()
    print(f'Banco e tabelas criados/atualizados com sucesso em "{path}"!')


if __name__ == '__main__':
    criar_banco()
