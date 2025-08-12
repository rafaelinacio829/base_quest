# add_user.py
import os
import psycopg2  # MUDANÇA: Importa a biblioteca para PostgreSQL
from psycopg2 import errors # MUDANÇA: Para tratar erros específicos do PG
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
import getpass

# Carrega as variáveis de ambiente do ficheiro .env
load_dotenv()

# Inicializa o bcrypt
bcrypt = Bcrypt()


def get_db_connection():
    """Cria uma conexão com o banco de dados PostgreSQL."""
    try:
        # Prioriza a conexão via DATABASE_URL, comum em serviços de hospedagem
        conn_str = os.environ.get('DATABASE_URL')
        if conn_str:
            conn = psycopg2.connect(conn_str)
        else:
            # MUDANÇA: Usa psycopg2.connect e nomes de variáveis de ambiente padrão
            conn = psycopg2.connect(
                host=os.environ.get('DB_HOST'),
                dbname=os.environ.get('DB_NAME'),
                user=os.environ.get('DB_USER'),
                password=os.environ.get('DB_PASSWORD'),
                port=os.environ.get('DB_PORT', 5432)
            )
        return conn
    except psycopg2.Error as e:
        print(f"Erro fatal ao conectar ao banco de dados: {e}")
        exit()


def add_new_user():
    """Função principal para adicionar um novo usuário."""
    print("--- Adicionar Novo Usuário ---")

    email = input("Email do novo usuário: ").strip()
    password = getpass.getpass("Senha do novo usuário: ").strip()
    nome = input("Primeiro nome: ").strip()
    sobrenome = input("Sobrenome: ").strip()

    if not all([email, password, nome, sobrenome]):
        print("\nErro: Todos os campos são obrigatórios.")
        return

    password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        sql_insert_query = """
                           INSERT INTO usuarios (email, senha_hash, nome, sobrenome)
                           VALUES (%s, %s, %s, %s)
                           """
        user_data = (email, password_hash, nome, sobrenome)

        cursor.execute(sql_insert_query, user_data)
        conn.commit()

        print(f"\nUsuário '{email}' adicionado com sucesso!")

    except errors.UniqueViolation as e:
        # MUDANÇA: Trata o erro específico de violação de unicidade (email duplicado)
        print(f"\nErro: O email '{email}' já existe na base de dados.")
        if conn:
            conn.rollback() # Desfaz a transação em caso de erro

    except psycopg2.Error as e:
        # MUDANÇA: Captura a exceção genérica do psycopg2
        print(f"\nOcorreu um erro ao inserir o usuário: {e}")
        if conn:
            conn.rollback()

    finally:
        # MUDANÇA: A verificação conn.is_connected() não é necessária
        if conn:
            cursor.close()
            conn.close()


if __name__ == '__main__':
    add_new_user()
