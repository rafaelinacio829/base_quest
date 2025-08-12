# app.py
import os
import io
import json
from datetime import datetime
import psycopg2
from psycopg2.extras import DictCursor
from flask import (Flask, render_template, request, redirect, url_for,
                   flash, session, jsonify, Response)
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv

# NOVAS IMPORTAÇÕES PARA PDF E DOCX
from fpdf import FPDF
from docx import Document
from docx.shared import Pt

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.secret_key = os.environ.get('SECRET_KEY')
bcrypt = Bcrypt(app)


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


@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('painel'))
    return redirect(url_for('login'))


@app.route('/painel')
def painel():
    if 'user_id' not in session: return redirect(url_for('login'))
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
        print(f"Erro ao buscar foto de perfil: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url, view='home')


@app.route('/search_questoes')
def search_questoes():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401

    query = request.args.get('q', '')
    if not query or len(query) < 2:
        return jsonify([])

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        sql_search = """
                     SELECT id, enunciado, tipo_questao, nivel_dificuldade, grau_ensino
                     FROM questoes
                     WHERE is_active = TRUE 
                       AND (enunciado ILIKE %s OR nivel_dificuldade::text ILIKE %s OR grau_ensino ILIKE %s)
                     ORDER BY id DESC LIMIT 10
                     """
        like_term = f"%{query}%"
        cursor.execute(sql_search, (like_term, like_term, like_term))
        results = [dict(row) for row in cursor.fetchall()]
        return jsonify(results)
    except psycopg2.Error as e:
        print(f"Erro na busca de questões: {e}")
        return jsonify({'error': 'Erro no servidor'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/questoes')
def questoes():
    if 'user_id' not in session: return redirect(url_for('login'))

    search_query = request.args.get('q', '')
    nome_completo = f"{session.get('user_nome', '')} {session.get('user_sobrenome', '')}".strip()
    foto_perfil_url, lista_questoes = None, []
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute('SELECT foto_perfil FROM usuarios WHERE id = %s', (session['user_id'],))
        user = cursor.fetchone()
        if user and user.get('foto_perfil'):
            data = user['foto_perfil']
            foto_perfil_url = data.decode('utf-8') if isinstance(data, (bytes, bytearray)) else data

        sql_query = "SELECT id, enunciado, tipo_questao, nivel_dificuldade, grau_ensino FROM questoes WHERE is_active = TRUE"
        params = []
        if search_query:
            sql_query += " AND (enunciado ILIKE %s OR nivel_dificuldade::text ILIKE %s OR grau_ensino ILIKE %s)"
            like_term = f"%{search_query}%"
            params.extend([like_term, like_term, like_term])
        sql_query += " ORDER BY id DESC"
        cursor.execute(sql_query, tuple(params))
        lista_questoes = cursor.fetchall()
    except psycopg2.Error as e:
        flash("Erro ao carregar as questões.", "error")
        print(f"Erro em /questoes: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()

    return render_template('painel.html', nome_completo=nome_completo, foto_perfil_url=foto_perfil_url, view='questoes',
                           questoes=lista_questoes, search_query=search_query)


@app.route('/lixeira')
def lixeira():
    if 'user_id' not in session: return redirect(url_for('login'))
    nome_completo = f"{session.get('user_nome', '')} {session.get('user_sobrenome', '')}".strip()
    foto_perfil_url, lista_questoes_excluidas = None, []
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute('SELECT foto_perfil FROM usuarios WHERE id = %s', (session['user_id'],))
        user = cursor.fetchone()
        if user and user.get('foto_perfil'):
            data = user['foto_perfil']
            foto_perfil_url = data.decode('utf-8') if isinstance(data, (bytes, bytearray)) else data
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
def configuracoes():
    if 'user_id' not in session: return redirect(url_for('login'))
    nome_completo = f"{session.get('user_nome', '')} {session.get('user_sobrenome', '')}".strip()
    foto_perfil_url, user_data = None, {}
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute('SELECT nome, sobrenome, email, foto_perfil FROM usuarios WHERE id = %s', (session['user_id'],))
        user_data = cursor.fetchone()

        if user_data and user_data.get('foto_perfil'):
            data = user_data['foto_perfil']
            foto_perfil_url = data.decode('utf-8') if isinstance(data, (bytes, bytearray)) else data
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
def update_profile():
    if 'user_id' not in session: return redirect(url_for('login'))
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
def change_password():
    if 'user_id' not in session: return redirect(url_for('login'))
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
def get_questao(questao_id):
    if 'user_id' not in session: return jsonify({'error': 'Não autenticado'}), 401
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute(
            "SELECT id, enunciado, tipo_questao, autor_id, nivel_dificuldade, grau_ensino FROM questoes WHERE id = %s",
            (questao_id,))
        questao = cursor.fetchone()
        if not questao: return jsonify({'error': 'Questão não encontrada'}), 404

        questao_dict = dict(questao)
        if questao['tipo_questao'] != 'DISCURSIVA':
            cursor.execute("SELECT texto_opcao, is_correta FROM opcoes WHERE questao_id = %s", (questao_id,))
            opcoes = cursor.fetchall()
            questao_dict['opcoes'] = [dict(op) for op in opcoes]
        return jsonify(questao_dict)
    except psycopg2.Error as e:
        print(f"Erro em /get_questao: {e}")
        return jsonify({'error': 'Erro no servidor'}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()


@app.route('/delete_questao/<int:questao_id>', methods=['POST'])
def delete_questao(questao_id):
    if 'user_id' not in session: return jsonify({'success': False, 'error': 'Não autenticado'}), 401
    user_id = session['user_id']
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questoes SET is_active = FALSE WHERE id = %s AND autor_id = %s", (questao_id, user_id))
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
def restore_questao(questao_id):
    if 'user_id' not in session: return jsonify({'success': False, 'error': 'Não autenticado'}), 401
    user_id = session['user_id']
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE questoes SET is_active = TRUE WHERE id = %s AND autor_id = %s", (questao_id, user_id))
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
def delete_permanently(questao_id):
    if 'user_id' not in session: return jsonify({'success': False, 'error': 'Não autenticado'}), 401
    user_id = session['user_id']
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM questoes WHERE id = %s AND autor_id = %s", (questao_id, user_id))
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
def edit_questao(questao_id):
    if 'user_id' not in session: return redirect(url_for('login'))
    user_id = session['user_id']
    enunciado = request.form.get('enunciado')
    nivel_dificuldade_form = request.form.get('nivel_dificuldade')
    grau_ensino = request.form.get('grau_ensino')
    if not all([enunciado, nivel_dificuldade_form]):
        flash("Enunciado e Nível de Dificuldade são obrigatórios.", "error")
        return redirect(url_for('questoes'))

    dificuldade_map = {
        'FACIL': 'Fácil',
        'MEDIO': 'Médio',
        'DIFICIL': 'Difícil',
        'MUITO DIFÍCIL': 'Muito Difícil'
    }
    nivel_dificuldade_db = dificuldade_map.get(nivel_dificuldade_form.upper().replace("_", " "), nivel_dificuldade_form)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        cursor.execute("SELECT autor_id, tipo_questao FROM questoes WHERE id = %s", (questao_id,))
        result = cursor.fetchone()
        if not result or result['autor_id'] != user_id:
            flash("Você não tem permissão para editar esta questão.", "error")
            return redirect(url_for('questoes'))

        tipo_questao = result['tipo_questao']
        sql_update = "UPDATE questoes SET enunciado = %s, nivel_dificuldade = %s, grau_ensino = %s WHERE id = %s"
        cursor.execute(sql_update, (enunciado, nivel_dificuldade_db, grau_ensino, questao_id))

        cursor.execute("DELETE FROM opcoes WHERE questao_id = %s", (questao_id,))
        if tipo_questao in ['ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA']:
            opcoes_texto = request.form.getlist('opcoes_texto[]')
            respostas_corretas_indices = request.form.getlist('respostas_corretas[]')
            for i, texto_opcao in enumerate(opcoes_texto):
                if not texto_opcao: continue
                is_correta = str(i) in respostas_corretas_indices
                sql_opcao = "INSERT INTO opcoes (questao_id, texto_opcao, is_correta) VALUES (%s, %s, %s)"
                cursor.execute(sql_opcao, (questao_id, texto_opcao, is_correta))
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
    return redirect(url_for('questoes'))


@app.route('/add_questao', methods=['POST'])
def add_questao():
    if 'user_id' not in session: return redirect(url_for('login'))
    tipo_questao = request.form.get('tipo_questao')
    enunciado = request.form.get('enunciado')
    nivel_dificuldade_form = request.form.get('nivel_dificuldade')
    grau_ensino = request.form.get('grau_ensino')
    autor_id = session['user_id']
    if not all([tipo_questao, enunciado, nivel_dificuldade_form]):
        flash("Todos os campos principais são obrigatórios.", "error")
        return redirect(url_for('questoes'))

    dificuldade_map = {
        'FACIL': 'Fácil',
        'MEDIO': 'Médio',
        'DIFICIL': 'Difícil',
        'MUITO DIFÍCIL': 'Muito Difícil'
    }
    nivel_dificuldade_db = dificuldade_map.get(nivel_dificuldade_form.upper().replace("_", " "), nivel_dificuldade_form)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        sql_questao = """
            INSERT INTO questoes (enunciado, tipo_questao, autor_id, nivel_dificuldade, grau_ensino) 
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        """
        cursor.execute(sql_questao, (enunciado, tipo_questao, autor_id, nivel_dificuldade_db, grau_ensino))

        questao_id = cursor.fetchone()[0]

        if tipo_questao in ['ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA']:
            opcoes_texto = request.form.getlist('opcoes_texto[]')
            respostas_corretas_indices = request.form.getlist('respostas_corretas[]')
            if not opcoes_texto: raise ValueError("Questões de múltipla escolha precisam de opções.")
            for i, texto_opcao in enumerate(opcoes_texto):
                if not texto_opcao: raise ValueError(f"O texto da opção {i + 1} não pode estar vazio.")
                is_correta = str(i) in respostas_corretas_indices
                sql_opcao = "INSERT INTO opcoes (questao_id, texto_opcao, is_correta) VALUES (%s, %s, %s)"
                cursor.execute(sql_opcao, (questao_id, texto_opcao, is_correta))
        conn.commit()
        flash("Questão cadastrada com sucesso!", "success")
    except (psycopg2.Error, ValueError) as e:
        if conn: conn.rollback()
        flash(f"Erro ao cadastrar a questão: {e}", "error")
        print(f"Erro em /add_questao: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()
    return redirect(url_for('questoes'))


@app.route('/upload_foto', methods=['POST'])
def upload_foto():
    if 'user_id' not in session: return jsonify({'success': False, 'error': 'Não autenticado'}), 401
    user_id = int(session['user_id'])
    image_data = request.get_json().get('image')
    if not image_data: return jsonify({'success': False, 'error': 'Dados da imagem em falta'}), 400
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE usuarios SET foto_perfil = %s WHERE id = %s", (image_data, user_id))
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
                if foto_perfil_data and isinstance(foto_perfil_data, (bytes, bytearray)):
                    foto_perfil_url = foto_perfil_data.decode('utf-8')
                elif foto_perfil_data:
                    foto_perfil_url = foto_perfil_data

                return jsonify({
                    'success': True,
                    'user': {
                        'nome_completo': f"{user['nome']} {user['sobrenome']}".strip(),
                        'foto_perfil_url': foto_perfil_url
                    },
                    # CORREÇÃO: Adicionando a URL de redirecionamento que faltava
                    'redirect_url': url_for('painel')
                })
            else:
                return jsonify({'success': False, 'message': 'Email ou senha inválidos.'}), 401

        except psycopg2.Error as e:
            print(f"Erro no login: {e}")
            return jsonify({'success': False, 'message': 'Erro ao conectar com o banco de dados.'}), 500
        finally:
            if conn:
                if 'cursor' in locals() and cursor:
                    cursor.close()
                conn.close()

    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    flash("Você saiu da sua conta.")
    return redirect(url_for('login'))


@app.route('/export_questoes', methods=['POST'])
def export_questoes():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401

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
            SELECT q.id, q.enunciado, q.tipo_questao, o.texto_opcao, o.is_correta
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
                    "opcoes": []
                }
            if row['texto_opcao']:
                questoes[questao_id]['opcoes'].append({
                    "texto": row['texto_opcao'],
                    "is_correta": bool(row['is_correta'])
                })

        questoes_lista = list(questoes.values())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"questoes_{timestamp}.{file_format}"

        if file_format == 'json':
            output = json.dumps(questoes_lista, indent=4, ensure_ascii=False)
            mimetype = 'application/json'
            return Response(output, mimetype=mimetype,
                            headers={"Content-Disposition": f"attachment;filename={filename}"})

        elif file_format == 'txt':
            string_io = io.StringIO()
            for q in questoes_lista:
                string_io.write(f"ID: {q['id']}\nEnunciado: {q['enunciado']}\nTipo: {q['tipo_questao']}\n")
                if q['opcoes']:
                    string_io.write("Opções:\n")
                    for i, op in enumerate(q['opcoes']):
                        correta = "[CORRETA]" if op['is_correta'] else ""
                        string_io.write(f"  {i + 1}. {op['texto']} {correta}\n")
                string_io.write("\n" + "=" * 50 + "\n\n")
            output = string_io.getvalue()
            mimetype = 'text/plain'
            return Response(output, mimetype=mimetype,
                            headers={"Content-Disposition": f"attachment;filename={filename}"})

        elif file_format == 'pdf':
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Arial", size=12)
            for q_idx, q in enumerate(questoes_lista):
                pdf.set_font("Arial", 'B', 14)
                pdf.multi_cell(0, 10,
                               f"{q_idx + 1}. (ID: {q['id']}) {q['enunciado']}".encode('latin-1', 'replace').decode(
                                   'latin-1'))
                pdf.set_font("Arial", size=12)
                if q['opcoes']:
                    pdf.ln(5)
                    for i, op in enumerate(q['opcoes']):
                        correta = " (Correta)" if op['is_correta'] else ""
                        text = f"   {chr(97 + i)}) {op['texto']}{correta}"
                        pdf.multi_cell(0, 8, text.encode('latin-1', 'replace').decode('latin-1'))
                pdf.ln(10)

            pdf_bytes = pdf.output(dest='S').encode('latin-1')
            mimetype = 'application/pdf'
            return Response(pdf_bytes, mimetype=mimetype,
                            headers={"Content-Disposition": f"attachment;filename={filename}"})

        elif file_format == 'docx':
            document = Document()
            for q_idx, q in enumerate(questoes_lista):
                p_enunciado = document.add_paragraph()
                p_enunciado.add_run(f"{q_idx + 1}. ").bold = True
                p_enunciado.add_run(q['enunciado'])

                if q['opcoes']:
                    for i, op in enumerate(q['opcoes']):
                        correta = " (Correta)" if op['is_correta'] else ""
                        p_op = document.add_paragraph(f"   {chr(97 + i)}) {op['texto']}{correta}", style='List Bullet')

                document.add_paragraph()

            file_stream = io.BytesIO()
            document.save(file_stream)
            file_stream.seek(0)

            mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            return Response(file_stream.read(), mimetype=mimetype,
                            headers={"Content-Disposition": f"attachment;filename={filename}"})

        else:
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
