# app.py
import os
import io
import json
import base64
from datetime import datetime
import psycopg2
from psycopg2.extras import DictCursor
from flask import (Flask, render_template, request, redirect, url_for,
                   flash, session, jsonify, Response)
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
from functools import wraps
import imghdr
import mimetypes

# NOVAS IMPORTAÇÕES PARA PDF E DOCX
from fpdf import FPDF
from docx import Document
from docx.shared import Pt, Inches

# NOVA IMPORTAÇÃO PARA O GEMINI
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
# Aumenta o limite de upload para suportar imagens maiores
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.secret_key = os.environ.get('SECRET_KEY')
bcrypt = Bcrypt(app)

# --- CONFIGURAÇÃO DA API GEMINI ---
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

generation_config = {
    "temperature": 0.7,
    "top_p": 1,
    "top_k": 1,
    "max_output_tokens": 2048,
}
model = genai.GenerativeModel(model_name="gemini-2.0-flash", generation_config=generation_config)


def get_db_connection():
    """Estabelece uma conexão com o banco de dados PostgreSQL."""
    try:
        conn_str = os.environ.get('DATABASE_URL')
        if conn_str:
            conn = psycopg2.connect(conn_str)
        else:
            conn = psycopg2.connect(
                host=os.environ.get('DB_HOST'),
                dbname=os.environ.get('DB_NAME'),
                user=os.environ.get('DB_USER'),
                password=os.environ.get('DB_PASSWORD'),
                port=os.environ.get('DB_PORT', 5432)
            )
        return conn
    except psycopg2.Error as e:
        print(f"Erro ao conectar ao banco de dados PostgreSQL: {e}")
        raise e


def clean_and_parse_json(response_text):
    """Limpa e tenta decodificar uma string JSON da resposta da IA."""
    if not response_text:
        return None
    clean_text = response_text.strip().replace('```json', '').replace('```', '').strip()
    try:
        return json.loads(clean_text)
    except json.JSONDecodeError as e:
        print(f"Erro ao decodificar JSON da IA: {e}")
        print(f"Texto recebido: {clean_text}")
        return None


# --- FUNÇÕES AUXILIARES DE BANCO DE DADOS ---
def search_questions_in_db(query_term):
    """Busca questões no banco de dados pelo termo fornecido."""
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    like_term = f"%{query_term}%"
    cursor.execute("SELECT id, enunciado FROM questoes WHERE is_active = TRUE AND enunciado ILIKE %s LIMIT 10",
                   (like_term,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results


def insert_question_in_db(question_data):
    """Insere uma nova questão e suas opções no banco de dados."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        dificuldade_map = {'FACIL': 'Fácil', 'MEDIO': 'Médio', 'DIFICIL': 'Difícil', 'MUITO_DIFICIL': 'Muito Difícil'}
        nivel_dificuldade_ia = question_data.get('nivel_dificuldade', 'MEDIO').upper()
        nivel_dificuldade_db = dificuldade_map.get(nivel_dificuldade_ia, 'Médio')

        sql_questao = """
                      INSERT INTO questoes (enunciado, tipo_questao, autor_id, nivel_dificuldade, grau_ensino, \
                                            area_conhecimento)
                      VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                      """
        cursor.execute(sql_questao, (
            question_data.get('enunciado'),
            question_data.get('tipo_questao', 'ESCOLHA_UNICA'),
            session['user_id'],
            nivel_dificuldade_db,
            question_data.get('grau_ensino'),
            question_data.get('area_conhecimento')
        ))
        questao_id = cursor.fetchone()[0]

        if 'opcoes' in question_data and questao_id:
            for opcao in question_data['opcoes']:
                sql_opcao = "INSERT INTO opcoes (questao_id, texto_opcao, is_correta) VALUES (%s, %s, %s)"
                cursor.execute(sql_opcao, (questao_id, opcao.get('texto_opcao'), bool(opcao.get('is_correta'))))

        conn.commit()
        return questao_id
    except psycopg2.Error as e:
        print(f"Erro ao inserir questão via IA: {e}")
        conn.rollback()
        return None
    finally:
        cursor.close()
        conn.close()


def get_user_data():
    """Busca os dados básicos do usuário logado."""
    if 'user_id' not in session:
        return None, None
    nome_completo = f"{session.get('user_nome', '')} {session.get('user_sobrenome', '')}".strip()
    foto_perfil_url = None
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute('SELECT foto_perfil FROM usuarios WHERE id = %s', (session['user_id'],))
        user = cursor.fetchone()
        if user and user.get('foto_perfil'):
            data = user['foto_perfil']
            foto_perfil_url = data.decode('utf-8') if isinstance(data, (bytes, bytearray)) else data
    except psycopg2.Error as e:
        print(f"Erro ao buscar dados do usuário: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return nome_completo, foto_perfil_url


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)

    return decorated_function


# --- ROTA DO CHAT COM IA ---
@app.route('/api/chat', methods=['POST'])
@login_required
def chat_ia():
    data = request.get_json()
    user_message = data.get('message')

    pending_action = "Sim" if 'pending_question' in session else "Não"
    intent_prompt = f"""
    Analise a mensagem do usuário para determinar a intenção. As intenções possíveis são: SEARCH, CREATE, INSERT, CHAT.
    - Se o usuário quer procurar, pesquisar ou buscar, a intenção é SEARCH.
    - Se o usuário quer criar ou gerar uma questão, a intenção é CREATE.
    - Se uma questão foi recém-criada (pending_action='Sim') e a mensagem do usuário é afirmativa (sim, pode, cadastre, confirme), a intenção é INSERT.
    - Caso contrário, a intenção é CHAT.
    Extraia o tópico/termo de busca se a intenção for SEARCH ou CREATE.
    Responda APENAS com um JSON.
    Exemplo: {{"intent": "SEARCH", "topic": "corpo humano"}}

    pending_action: {pending_action}
    Mensagem do usuário: "{user_message}"
    """

    try:
        response = model.generate_content(intent_prompt)
        intent_data = clean_and_parse_json(response.text)

        if not intent_data:
            raise ValueError("A IA não retornou um JSON de intenção válido.")

        intent = intent_data.get("intent")
        topic = intent_data.get("topic")

        if intent == "SEARCH":
            results = search_questions_in_db(topic)
            if results:
                message = f"Encontrei {len(results)} questões sobre '{topic}':\n"
                for res in results:
                    message += f"- #{res['id']}: {res['enunciado'][:80]}...\n"
            else:
                message = f"Não encontrei nenhuma questão sobre '{topic}'. Gostaria que eu criasse uma para você?"
            return jsonify({'type': 'chat', 'message': message})

        elif intent == "CREATE":
            create_prompt = f"""
            Crie uma questão de múltipla escolha sobre o tópico "{topic}".
            Formate a resposta como um JSON válido.
            O JSON deve ter as chaves: "enunciado", "tipo_questao", "nivel_dificuldade", "grau_ensino", "area_conhecimento", e "opcoes".
            A chave "tipo_questao" DEVE ter o valor "ESCOLHA_UNICA".
            A chave "nivel_dificuldade" DEVE ser um dos seguintes valores: "FACIL", "MEDIO", "DIFICIL".
            A chave "area_conhecimento" deve ser uma string com a matéria principal da questão (ex: "História", "Biologia", "Matemática").
            A chave "opcoes" deve ser uma lista de 4 objetos, cada um com as chaves "texto_opcao" e "is_correta" (booleano), e apenas uma opção pode ser correta.
            Responda APENAS com o JSON.
            """
            response = model.generate_content(create_prompt)
            question_json = clean_and_parse_json(response.text)

            if not question_json:
                raise ValueError("A IA não retornou um JSON de questão válido.")

            session['pending_question'] = question_json

            message = f"Criei a seguinte questão sobre '{topic}':\n\n"
            message += f"**Enunciado:** {question_json.get('enunciado', 'N/A')}\n"
            for i, opt in enumerate(question_json.get('opcoes', [])):
                message += f"{i + 1}. {opt.get('texto_opcao', 'N/A')}\n"
            message += "\nVocê gostaria de cadastrá-la no banco de dados?"
            return jsonify({'type': 'chat', 'message': message})

        elif intent == "INSERT":
            pending_question = session.get('pending_question')
            if pending_question:
                new_question_id = insert_question_in_db(pending_question)
                if new_question_id:
                    message = f"Perfeito! A questão #{new_question_id} foi cadastrada com sucesso no seu banco de dados. ✅"
                    session.pop('pending_question', None)
                else:
                    message = "Ocorreu um erro ao tentar cadastrar a questão. Por favor, tente novamente."
            else:
                message = "Não encontrei nenhuma questão pendente para cadastrar. Gostaria de criar uma?"
            return jsonify({'type': 'chat', 'message': message})

        else:  # CHAT
            chat_prompt = f"""
            Você é um assistente de IA amigável e prestativo para um banco de questões escolar.
            Suas funções são: pesquisar, criar e cadastrar questões.
            Responda à seguinte mensagem do usuário de forma conversacional: "{topic}"
            """
            response = model.generate_content(chat_prompt)
            return jsonify({'type': 'chat', 'message': response.text})

    except Exception as e:
        print(f"Erro na API do Gemini ou no processamento do chat: {e}")
        session.pop('pending_question', None)
        return jsonify({'type': 'chat',
                        'message': 'Desculpe, não consegui processar a resposta da IA. Poderia reformular seu pedido?'}), 500


# --- ROTAS EXISTENTES ---
@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('painel'))
    return redirect(url_for('login'))


@app.route('/painel')
@login_required
def painel():
    nome_completo, foto_perfil_url = get_user_data()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url, view='home')


@app.route('/search_questoes')
@login_required
def search_questoes():
    query = request.args.get('q', '')
    if not query or len(query) < 2:
        return jsonify([])
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        sql_search = """
                     SELECT id, enunciado, tipo_questao, nivel_dificuldade, grau_ensino, area_conhecimento
                     FROM questoes
                     WHERE is_active = TRUE
                       AND (enunciado ILIKE %s OR nivel_dificuldade::text ILIKE %s OR grau_ensino ILIKE %s OR area_conhecimento ILIKE %s)
                     ORDER BY id DESC LIMIT 10
                     """
        like_term = f"%{query}%"
        cursor.execute(sql_search, (like_term, like_term, like_term, like_term))
        results = [dict(row) for row in cursor.fetchall()]
        return jsonify(results)
    except psycopg2.Error as e:
        print(f"Erro na busca de questões: {e}")
        return jsonify({'error': 'Erro no servidor'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/banco_questoes')
@login_required
def banco_questoes():
    nome_completo, foto_perfil_url = get_user_data()
    search_query = request.args.get('q', '')
    lista_questoes = []
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        sql_query = "SELECT id, enunciado, tipo_questao, nivel_dificuldade, grau_ensino, area_conhecimento FROM questoes WHERE is_active = TRUE"
        params = []
        if search_query:
            sql_query += " AND (enunciado ILIKE %s OR nivel_dificuldade::text ILIKE %s OR grau_ensino ILIKE %s OR area_conhecimento ILIKE %s)"
            like_term = f"%{search_query}%"
            params.extend([like_term, like_term, like_term, like_term])
        sql_query += " ORDER BY id DESC"
        cursor.execute(sql_query, tuple(params))
        lista_questoes = cursor.fetchall()
    except psycopg2.Error as e:
        flash("Erro ao carregar as questões.", "error")
        print(f"Erro em /banco_questoes: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url,
                           view='banco_questoes',
                           questoes=lista_questoes, search_query=search_query)


@app.route('/cadastrar_questoes')
@login_required
def cadastrar_questoes():
    nome_completo, foto_perfil_url = get_user_data()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url,
                           view='cadastrar_questoes')


@app.route('/chat_ia')
@login_required
def chat_page():
    nome_completo, foto_perfil_url = get_user_data()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url, view='chat_ia')


@app.route('/generate_questao', methods=['POST'])
@login_required
def generate_questao():
    data = request.get_json()
    tipo = data.get('tipo', 'ESCOLHA_UNICA')
    nivel = data.get('nivel', 'Fácil')
    grau = data.get('grau', 'Ensino Fundamental')
    area = data.get('area', 'Conhecimentos Gerais')
    prompt = (f"Gere uma questão de {tipo.replace('_', ' ').lower()} "
              f"com dificuldade {nivel.lower()} para o {grau.lower()} sobre {area}. "
              "O enunciado deve ser claro. Para questões de escolha única ou múltipla, "
              "gere 4 opções, e uma ou mais delas deve ser a correta. "
              "Formate a resposta como um JSON válido com as seguintes chaves: "
              "'enunciado', 'tipo_questao', 'nivel_dificuldade', 'grau_ensino', 'area_conhecimento', 'opcoes'. "
              "A chave 'opcoes' deve ser uma lista de objetos, cada um com as chaves 'texto' e 'is_correta' (booleano). "
              "O JSON deve estar completo e não pode conter comentários ou texto extra.")
    try:
        response = model.generate_content(prompt)
        questao_gerada = clean_and_parse_json(response.text)
        if not questao_gerada:
            raise ValueError("A IA não retornou um JSON de questão válido.")
        return jsonify(questao_gerada)
    except Exception as e:
        print(f"Erro ao gerar questão com Gemini: {e}")
        return jsonify({'error': 'Falha ao gerar questão com a IA.'}), 500


@app.route('/lixeira')
@login_required
def lixeira():
    nome_completo, foto_perfil_url = get_user_data()
    lista_questoes_excluidas = []
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute("SELECT id, enunciado, tipo_questao FROM questoes WHERE is_active = FALSE ORDER BY id DESC")
        lista_questoes_excluidas = cursor.fetchall()
    except psycopg2.Error as e:
        flash("Erro ao carregar a lixeira.", "error")
        print(f"Erro em /lixeira: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url, view='lixeira',
                           questoes=lista_questoes_excluidas)


@app.route('/configuracoes')
@login_required
def configuracoes():
    nome_completo, foto_perfil_url = get_user_data()
    user_data = {}
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute('SELECT nome, sobrenome, email FROM usuarios WHERE id = %s', (session['user_id'],))
        user_data = cursor.fetchone()
    except psycopg2.Error as e:
        flash("Não foi possível carregar os seus dados.", "error")
        print(f"Erro em /configuracoes: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url,
                           view='configuracoes', user=user_data)


@app.route('/update_profile', methods=['POST'])
@login_required
def update_profile():
    nome = request.form.get('nome')
    sobrenome = request.form.get('sobrenome')
    if not nome or not sobrenome:
        flash("Nome e sobrenome são obrigatórios.", "error")
        return redirect(url_for('configuracoes'))
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE usuarios SET nome = %s, sobrenome = %s WHERE id = %s",
                       (nome, sobrenome, session['user_id']))
        conn.commit()
        session['user_nome'] = nome
        session['user_sobrenome'] = sobrenome
        flash("Perfil atualizado com sucesso!", "success")
    except psycopg2.Error as e:
        if conn: conn.rollback()
        flash("Ocorreu um erro ao atualizar o seu perfil.", "error")
        print(f"Erro em /update_profile: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return redirect(url_for('configuracoes'))


@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    senha_atual = request.form.get('senha_atual')
    nova_senha = request.form.get('nova_senha')
    confirmar_senha = request.form.get('confirmar_senha')
    if not all([senha_atual, nova_senha, confirmar_senha]):
        flash("Todos os campos de senha são obrigatórios.", "error")
        return redirect(url_for('configuracoes'))
    if nova_senha != confirmar_senha:
        flash("As novas senhas não coincidem.", "error")
        return redirect(url_for('configuracoes'))
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute("SELECT senha_hash FROM usuarios WHERE id = %s", (session['user_id'],))
        user = cursor.fetchone()
        if not user or not bcrypt.check_password_hash(user['senha_hash'], senha_atual):
            flash("A sua senha atual está incorreta.", "error")
            return redirect(url_for('configuracoes'))
        nova_senha_hash = bcrypt.generate_password_hash(nova_senha).decode('utf-8')
        cursor.execute("UPDATE usuarios SET senha_hash = %s WHERE id = %s", (nova_senha_hash, session['user_id']))
        conn.commit()
        flash("Senha alterada com sucesso!", "success")
    except psycopg2.Error as e:
        if conn: conn.rollback()
        flash("Ocorreu um erro ao alterar a sua senha.", "error")
        print(f"Erro em /change_password: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return redirect(url_for('configuracoes'))


@app.route('/get_questao/<int:questao_id>')
@login_required
def get_questao(questao_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute(
            "SELECT id, enunciado, tipo_questao, autor_id, nivel_dificuldade, grau_ensino, area_conhecimento, imagem_url FROM questoes WHERE id = %s",
            (questao_id,))
        questao = cursor.fetchone()
        if not questao:
            return jsonify({'error': 'Questão não encontrada'}), 404
        questao_dict = dict(questao)
        # Converte a imagem do enunciado para Base64 se existir
        if questao['imagem_url']:
            imagem_bytes = questao['imagem_url']
            mime_type = imghdr.what(io.BytesIO(imagem_bytes))
            if mime_type:
                mime_type = 'image/' + mime_type
            elif imagem_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                mime_type = 'image/png'
            else:
                mime_type = 'image/jpeg'
            questao_dict['imagem_url'] = f"data:{mime_type};base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
        else:
            questao_dict['imagem_url'] = None

        if questao['tipo_questao'] != 'DISCURSIVA':
            cursor.execute("SELECT texto_opcao, is_correta, imagem_url FROM opcoes WHERE questao_id = %s",
                           (questao_id,))
            opcoes_raw = cursor.fetchall()
            opcoes_list = []
            for op in opcoes_raw:
                op_dict = dict(op)
                if op['imagem_url']:
                    imagem_bytes = op['imagem_url']
                    mime_type = imghdr.what(io.BytesIO(imagem_bytes))
                    if mime_type:
                        mime_type = 'image/' + mime_type
                    elif imagem_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                        mime_type = 'image/png'
                    else:
                        mime_type = 'image/jpeg'
                    op_dict['imagem_url'] = f"data:{mime_type};base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
                else:
                    op_dict['imagem_url'] = None
                opcoes_list.append(op_dict)
            questao_dict['opcoes'] = opcoes_list
        return jsonify(questao_dict)
    except psycopg2.Error as e:
        print(f"Erro em /get_questao: {e}")
        return jsonify({'error': 'Erro no servidor'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/delete_questao/<int:questao_id>', methods=['POST'])
@login_required
def delete_questao(questao_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questoes SET is_active = FALSE WHERE id = %s AND autor_id = %s",
                       (questao_id, session['user_id']))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'success': False, 'error': 'Questão não encontrada ou sem permissão.'}), 404
        conn.commit()
        return jsonify({'success': True, 'message': 'Questão movida para a lixeira!'})
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Erro em /delete_questao: {e}")
        return jsonify({'success': False, 'error': 'Erro no servidor.'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/restore_questao/<int:questao_id>', methods=['POST'])
@login_required
def restore_questao(questao_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questoes SET is_active = TRUE WHERE id = %s AND autor_id = %s",
                       (questao_id, session['user_id']))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'success': False, 'error': 'Questão não encontrada ou sem permissão.'}), 404
        conn.commit()
        return jsonify({'success': True, 'message': 'Questão restaurada!'})
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Erro em /restore_questao: {e}")
        return jsonify({'success': False, 'error': 'Erro no servidor.'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/delete_permanently/<int:questao_id>', methods=['POST'])
@login_required
def delete_permanently(questao_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM questoes WHERE id = %s AND autor_id = %s", (questao_id, session['user_id']))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'success': False, 'error': 'Questão não encontrada ou sem permissão.'}), 404
        conn.commit()
        return jsonify({'success': True, 'message': 'Questão excluída permanentemente!'})
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Erro em /delete_permanently: {e}")
        return jsonify({'success': False, 'error': 'Erro no servidor.'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/edit_questao/<int:questao_id>', methods=['POST'])
@login_required
def edit_questao(questao_id):
    enunciado = request.form.get('enunciado')
    nivel_dificuldade_form = request.form.get('nivel_dificuldade')
    grau_ensino = request.form.get('grau_ensino')
    area_conhecimento = request.form.get('area_conhecimento')

    imagem_questao = request.files.get('imagem')
    imagem_questao_dados = imagem_questao.read() if imagem_questao and imagem_questao.filename else None

    if not all([enunciado, nivel_dificuldade_form]):
        flash("Enunciado e Nível de Dificuldade são obrigatórios.", "error")
        return redirect(url_for('banco_questoes'))
    dificuldade_map = {'FACIL': 'Fácil', 'MEDIO': 'Médio', 'DIFICIL': 'Difícil', 'MUITO_DIFICIL': 'Muito Difícil'}
    nivel_dificuldade_db = dificuldade_map.get(nivel_dificuldade_form.upper().replace("_", " "), nivel_dificuldade_form)
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute("SELECT autor_id, tipo_questao FROM questoes WHERE id = %s", (questao_id,))
        result = cursor.fetchone()
        if not result or result['autor_id'] != session['user_id']:
            flash("Você não tem permissão para editar esta questão.", "error")
            return redirect(url_for('banco_questoes'))
        tipo_questao = result['tipo_questao']

        sql_update = """
                     UPDATE questoes \
                     SET enunciado         = %s, \
                         nivel_dificuldade = %s, \
                         grau_ensino       = %s, \
                         area_conhecimento = %s, \
                         imagem_url        = %s \
                     WHERE id = %s
                     """
        cursor.execute(sql_update,
                       (enunciado, nivel_dificuldade_db, grau_ensino, area_conhecimento, imagem_questao_dados,
                        questao_id))

        cursor.execute("DELETE FROM opcoes WHERE questao_id = %s", (questao_id,))

        if tipo_questao in ['ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA']:
            opcoes_texto = request.form.getlist('opcoes_texto[]')
            opcoes_imagens = request.files.getlist('opcoes_imagem[]')
            respostas_corretas_indices = request.form.getlist('respostas_corretas[]')

            for i, texto_opcao in enumerate(opcoes_texto):
                imagem_opcao_dados = opcoes_imagens[i].read() if opcoes_imagens and i < len(opcoes_imagens) and \
                                                                 opcoes_imagens[i].filename else None
                if not texto_opcao and not imagem_opcao_dados: continue
                is_correta = str(i) in respostas_corretas_indices
                sql_opcao = "INSERT INTO opcoes (questao_id, texto_opcao, is_correta, imagem_url) VALUES (%s, %s, %s, %s)"
                cursor.execute(sql_opcao, (questao_id, texto_opcao, is_correta, imagem_opcao_dados))

        conn.commit()
        flash("Questão atualizada com sucesso!", "success")
    except (psycopg2.Error, ValueError) as e:
        if conn: conn.rollback()
        flash(f"Erro ao atualizar a questão: {e}", "error")
        print(f"Erro em /edit_questao: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return redirect(url_for('banco_questoes'))


@app.route('/add_questao', methods=['POST'])
@login_required
def add_questao():
    tipo_questao = request.form.get('tipo_questao')
    enunciado = request.form.get('enunciado')
    nivel_dificuldade_form = request.form.get('nivel_dificuldade')
    grau_ensino = request.form.get('grau_ensino')
    area_conhecimento = request.form.get('area_conhecimento')

    imagem_questao = request.files.get('imagem')
    imagem_questao_dados = imagem_questao.read() if imagem_questao and imagem_questao.filename else None

    if not all([tipo_questao, enunciado, nivel_dificuldade_form]):
        flash("Todos os campos principais são obrigatórios.", "error")
        return redirect(url_for('cadastrar_questoes'))
    dificuldade_map = {'FACIL': 'Fácil', 'MEDIO': 'Médio', 'DIFICIL': 'Difícil', 'MUITO_DIFICIL': 'Muito Difícil'}
    nivel_dificuldade_db = dificuldade_map.get(nivel_dificuldade_form.upper().replace("_", " "), nivel_dificuldade_form)
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        sql_questao = """
                      INSERT INTO questoes (enunciado, tipo_questao, autor_id, nivel_dificuldade, grau_ensino, \
                                            area_conhecimento, imagem_url)
                      VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                      """
        cursor.execute(sql_questao, (enunciado, tipo_questao, session['user_id'], nivel_dificuldade_db, grau_ensino,
                                     area_conhecimento, imagem_questao_dados))
        questao_id = cursor.fetchone()[0]

        if tipo_questao in ['ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA']:
            opcoes_texto = request.form.getlist('opcoes_texto[]')
            opcoes_imagens = request.files.getlist('opcoes_imagem[]')
            respostas_corretas_indices = request.form.getlist('respostas_corretas[]')

            if not opcoes_texto and not opcoes_imagens:
                raise ValueError("Questões de múltipla escolha precisam de pelo menos uma opção.")

            for i, texto_opcao in enumerate(opcoes_texto):
                imagem_opcao_dados = opcoes_imagens[i].read() if opcoes_imagens and i < len(opcoes_imagens) and \
                                                                 opcoes_imagens[i].filename else None
                if not texto_opcao and not imagem_opcao_dados: continue

                is_correta = str(i) in respostas_corretas_indices
                sql_opcao = "INSERT INTO opcoes (questao_id, texto_opcao, is_correta, imagem_url) VALUES (%s, %s, %s, %s)"
                cursor.execute(sql_opcao, (questao_id, texto_opcao, is_correta, imagem_opcao_dados))

        conn.commit()
        flash("Questão cadastrada com sucesso!", "success")
    except (psycopg2.Error, ValueError) as e:
        if conn: conn.rollback()
        flash(f"Erro ao cadastrar a questão: {e}", "error")
        print(f"Erro em /add_questao: {e}")
        return redirect(url_for('cadastrar_questoes'))
    finally:
        if conn:
            cursor.close()
            conn.close()
    return redirect(url_for('banco_questoes'))


@app.route('/upload_foto', methods=['POST'])
@login_required
def upload_foto():
    image_data = request.get_json().get('image')
    if not image_data:
        return jsonify({'success': False, 'error': 'Dados da imagem em falta'}), 400
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE usuarios SET foto_perfil = %s WHERE id = %s", (image_data, session['user_id']))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'success': False, 'error': 'Utilizador não encontrado.'}), 404
        conn.commit()
        return jsonify({'success': True})
    except psycopg2.Error as e:
        if conn: conn.rollback()
        print(f"Erro em /upload_foto: {e}")
        return jsonify({'success': False, 'error': 'Erro no servidor.'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('painel'))
    if request.method == 'POST':
        email = request.form.get('email')
        senha = request.form.get('senha')
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=DictCursor)
            cursor.execute('SELECT id, nome, sobrenome, senha_hash, foto_perfil FROM usuarios WHERE email = %s',
                           (email,))
            user = cursor.fetchone()
            if user and bcrypt.check_password_hash(user['senha_hash'], senha):
                session['user_id'] = user['id']
                session['user_nome'] = user['nome']
                session['user_sobrenome'] = user['sobrenome']
                foto_perfil_data = user.get('foto_perfil')
                foto_perfil_url = None
                if foto_perfil_data:
                    foto_perfil_url = foto_perfil_data.decode('utf-8') if isinstance(foto_perfil_data, (bytes,
                                                                                                        bytearray)) else foto_perfil_data
                return jsonify({
                    'success': True,
                    'user': {
                        'nome_completo': f"{user['nome']} {user['sobrenome']}".strip(),
                        'foto_perfil_url': foto_perfil_url
                    },
                    'redirect_url': url_for('painel')
                })
            else:
                return jsonify({'success': False, 'message': 'Email ou senha inválidos.'}), 401
        except psycopg2.Error as e:
            print(f"Erro no login: {e}")
            return jsonify({'success': False, 'message': 'Erro ao conectar com o banco de dados.'}), 500
        finally:
            if conn:
                cursor.close()
                conn.close()
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    flash("Você saiu da sua conta.")
    return redirect(url_for('login'))


@app.route('/export_questoes', methods=['POST'])
@login_required
def export_questoes():
    data = request.get_json()
    ids = data.get('ids')
    file_format = data.get('format')
    if not ids or not file_format:
        return jsonify({'error': 'IDs ou formato não fornecidos'}), 400
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        placeholders = ','.join(['%s'] * len(ids))
        sql_query = f"""
            SELECT q.id, q.enunciado, q.tipo_questao, q.imagem_url AS questao_imagem, 
                   o.texto_opcao, o.is_correta, o.imagem_url AS opcao_imagem
            FROM questoes q
            LEFT JOIN opcoes o ON q.id = o.questao_id
            WHERE q.id IN ({placeholders}) AND q.autor_id = %s
            ORDER BY q.id, o.id
        """
        params = tuple(ids) + (session['user_id'],)
        cursor.execute(sql_query, params)
        results = cursor.fetchall()
        questoes = {}
        for row in results:
            questao_id = row['id']
            if questao_id not in questoes:
                questoes[questao_id] = {
                    "id": row['id'],
                    "enunciado": row['enunciado'],
                    "tipo_questao": row['tipo_questao'],
                    "imagem_url": row['questao_imagem'],
                    "opcoes": []
                }
            if row['texto_opcao'] or row['opcao_imagem']:
                questoes[questao_id]['opcoes'].append({
                    "texto": row['texto_opcao'],
                    "is_correta": bool(row['is_correta']),
                    "imagem_url": row['opcao_imagem']
                })
        questoes_lista = list(questoes.values())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"questoes_{timestamp}.{file_format}"
        if file_format == 'json':
            for q in questoes_lista:
                if q['imagem_url']:
                    imagem_bytes = q['imagem_url']
                    mime_type = imghdr.what(io.BytesIO(imagem_bytes))
                    if mime_type:
                        q[
                            'imagem_url'] = f"data:image/{mime_type};base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
                    else:
                        q['imagem_url'] = f"data:image/png;base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
                if q['opcoes']:
                    for op in q['opcoes']:
                        if op['imagem_url']:
                            imagem_bytes = op['imagem_url']
                            mime_type = imghdr.what(io.BytesIO(imagem_bytes))
                            if mime_type:
                                op[
                                    'imagem_url'] = f"data:image/{mime_type};base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
                            else:
                                op[
                                    'imagem_url'] = f"data:image/png;base64,{base64.b64encode(imagem_bytes).decode('utf-8')}"
            output = json.dumps(questoes_lista, indent=4, ensure_ascii=False)
            mimetype = 'application/json'
            return Response(output, mimetype=mimetype,
                            headers={"Content-Disposition": f"attachment;filename={filename}"})
        elif file_format == 'txt':
            string_io = io.StringIO()
            for q_idx, q in enumerate(questoes_lista):
                string_io.write(f"Questão #{q_idx + 1} - ID: {q['id']}\n")
                string_io.write(f"Enunciado: {q['enunciado']}\n")
                if q['imagem_url']:
                    string_io.write("IMAGEM DA QUESTÃO: Anexada (Representação Base64 abaixo)\n")
                    base64_img = base64.b64encode(q['imagem_url']).decode('utf-8')
                    string_io.write(f"  [Imagem Base64: {base64_img[:50]}...]\n")
                if q['opcoes']:
                    string_io.write("Opções:\n")
                    for i, op in enumerate(q['opcoes']):
                        correta = "[CORRETA]" if op['is_correta'] else ""
                        string_io.write(f"  {chr(97 + i)}) {op['texto']} {correta}\n")
                        if op['imagem_url']:
                            base64_img = base64.b64encode(op['imagem_url']).decode('utf-8')
                            string_io.write(f"    - Imagem: [Imagem Base64: {base64_img[:50]}...]\n")
                string_io.write("\n" + "=" * 50 + "\n\n")
            output = string_io.getvalue()
            return Response(output, mimetype='text/plain',
                            headers={"Content-Disposition": f"attachment;filename={filename}"})
        elif file_format == 'pdf':
            pdf = FPDF()
            pdf.add_page()
            for q_idx, q in enumerate(questoes_lista):
                pdf.set_font("Arial", 'B', 14)
                pdf.multi_cell(0, 10,
                               f"{q_idx + 1}. {q['enunciado']}".encode('latin-1', 'replace').decode('latin-1'))
                if q['imagem_url']:
                    try:
                        temp_img = io.BytesIO(q['imagem_url'])
                        pdf.image(temp_img, w=pdf.w / 2)
                        pdf.ln(5)
                    except Exception as e:
                        print(f"Erro ao adicionar imagem da questão ao PDF: {e}")

                pdf.set_font("Arial", size=12)
                if q['opcoes']:
                    pdf.ln(5)
                    for i, op in enumerate(q['opcoes']):
                        text = f"   {chr(97 + i)}) {op['texto']}"
                        pdf.multi_cell(0, 8, text.encode('latin-1', 'replace').decode('latin-1'))
                        if op['imagem_url']:
                            try:
                                temp_img = io.BytesIO(op['imagem_url'])
                                pdf.image(temp_img, x=20, w=pdf.w / 4)
                            except Exception as e:
                                print(f"Erro ao adicionar imagem da opção ao PDF: {e}")
                    pdf.ln(5)
            pdf_bytes = pdf.output(dest='S').encode('latin-1')
            return Response(pdf_bytes, mimetype='application/pdf',
                            headers={"Content-Disposition": f"attachment;filename={filename}"})
        elif file_format == 'docx':
            document = Document()
            for q_idx, q in enumerate(questoes_lista):
                p_enunciado = document.add_paragraph()
                p_enunciado.add_run(f"{q_idx + 1}. ").bold = True
                p_enunciado.add_run(q['enunciado'])
                if q['imagem_url']:
                    try:
                        image_stream = io.BytesIO(q['imagem_url'])
                        document.add_picture(image_stream, width=Inches(4))
                    except Exception as e:
                        print(f"Erro ao adicionar imagem da questão ao DOCX: {e}")
                        document.add_paragraph("  [IMAGEM DA QUESTÃO NÃO PODE SER EXPORTADA]")

                if q['opcoes']:
                    for i, op in enumerate(q['opcoes']):
                        p_opcao = document.add_paragraph()
                        p_opcao.add_run(f"   {chr(97 + i)}) {op['texto']}")
                        if op['imagem_url']:
                            try:
                                image_stream = io.BytesIO(op['imagem_url'])
                                document.add_picture(image_stream, width=Inches(2))
                            except Exception as e:
                                print(f"Erro ao adicionar imagem da opção ao DOCX: {e}")
                                document.add_paragraph("    [IMAGEM DA OPÇÃO NÃO PODE SER EXPORTADA]")
                document.add_paragraph()
            file_stream = io.BytesIO()
            document.save(file_stream)
            file_stream.seek(0)
            return Response(file_stream.read(),
                            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            headers={"Content-Disposition": f"attachment;filename={filename}"})
        return jsonify({'error': 'Formato inválido'}), 400
    except psycopg2.Error as e:
        print(f"Erro na exportação: {e}")
        return jsonify({'error': 'Erro no servidor ao exportar'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 4000))
    app.run(host='0.0.0.0', port=port, debug=True)