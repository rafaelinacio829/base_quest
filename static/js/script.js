document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DE DESTAQUE AO CARREGAR A PÁGINA ---
    if (window.location.hash && window.location.hash.startsWith('#questao-')) {
        const questionId = window.location.hash;
        const questionElement = document.querySelector(questionId);
        if (questionElement) {
            questionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            questionElement.classList.add('highlight');
            setTimeout(() => {
                questionElement.classList.remove('highlight');
            }, 2000); // Duração da animação
        }
    }

    // --- SELETORES GERAIS CACHEADOS ---
    const dashboardBody = document.querySelector('.dashboard-body');
    const topBarImage = document.getElementById('topBarImage');
    const menuImage = document.getElementById('menuImage');
    const profileUpload = document.getElementById('profileUpload');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const topBarProfile = document.getElementById('topBarProfile');

    let currentQuestionData = {};

    // ===================================
    // FUNÇÕES DE UTILIDADE E AUXILIARES
    // ===================================
    const showFlashMessage = (message, type) => {
        const flashContainer = document.createElement('div');
        flashContainer.className = `flash-message ${type}`;
        flashContainer.textContent = message;
        const contentPanel = document.querySelector('.content-panel');
        if (contentPanel) {
            contentPanel.insertBefore(flashContainer, contentPanel.firstChild);
            setTimeout(() => {
                flashContainer.remove();
            }, 5000);
        } else {
            alert(`${type.toUpperCase()}: ${message}`);
        }
    };

    const toggleMenu = () => {
        dashboardBody?.classList.toggle('menu-open');
        dropdownMenu?.classList.toggle('open');
        hamburgerMenu?.classList.toggle('open');
        topBarProfile?.classList.toggle('hidden');
    };

    // ===================================
    // MÓDULO: TEMA (CLARO/ESCURO)
    // ===================================
    const setupThemeToggler = () => {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const themeLink = document.getElementById('theme-link');
        if (!themeToggleBtn || !themeLink) return;
        const moonIconClass = 'fa-moon', sunIconClass = 'fa-sun';
        const setTheme = (theme) => {
            const isDark = theme === 'dark';
            themeLink.setAttribute('href', isDark ? "/static/css/tema_escuro.css" : "/static/css/tema_claro.css");
            themeToggleBtn.innerHTML = `<i class="fas ${isDark ? sunIconClass : moonIconClass}"></i>`;
            document.body.classList.toggle('dark-theme', isDark);
            document.body.classList.toggle('light-theme', !isDark);
            localStorage.setItem('theme', theme);
        };
        themeToggleBtn.addEventListener('click', () => setTheme(localStorage.getItem('theme') === 'dark' ? 'light' : 'dark'));
        setTheme(localStorage.getItem('theme') || 'light');
    };

    // ===================================
    // MÓDULO: LOGIN
    // ===================================
    const setupLoginForm = () => {
        const loginForm = document.getElementById('loginForm');
        if (!loginForm) return;
        const loginContainer = document.getElementById('loginContainer'), welcomeContainer = document.getElementById('welcomeContainer'), welcomeAvatar = document.getElementById('welcomeAvatar'), welcomeMessage = document.getElementById('welcomeMessage'), errorMessage = document.getElementById('errorMessage'), defaultAvatar = "/static/images/default-avatar.svg";
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorMessage.hidden = true;
            try {
                const response = await fetch(loginForm.action, { method: 'POST', body: new URLSearchParams(new FormData(loginForm)) });
                const data = await response.json();
                if (data.success) {
                    if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo, ${data.user.nome_completo}!`;
                    if (welcomeAvatar) welcomeAvatar.src = data.user.foto_perfil_url || defaultAvatar;
                    loginContainer?.classList.add('animating');
                    if (welcomeContainer) welcomeContainer.hidden = false;
                    setTimeout(() => window.location.href = data.redirect_url, 2500);
                } else {
                    if (errorMessage) { errorMessage.textContent = data.message; errorMessage.hidden = false; }
                }
            } catch (error) {
                console.error('Erro no login:', error);
                if (errorMessage) { errorMessage.textContent = 'Ocorreu um erro de comunicação. Tente novamente.'; errorMessage.hidden = false; }
            }
        });
    };

    // ===================================
    // MÓDULO: UPLOAD DE FOTO
    // ===================================
    const setupProfilePhotoUpload = () => {
        if (!profileUpload) return;
        profileUpload.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result;
                if (topBarImage) topBarImage.src = base64Image;
                if (menuImage) menuImage.src = base64Image;
                try {
                    const res = await fetch('/upload_foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64Image }) });
                    const data = await res.json();
                    if (data.success) { location.reload(); }
                    else { showFlashMessage('Erro ao salvar a foto: ' + (data.error || 'Erro desconhecido'), 'error'); }
                } catch (error) {
                    showFlashMessage('Erro de conexão ao enviar a foto.', 'error');
                    console.error('Erro no upload de foto:', error);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    // ===================================
    // MÓDULO: MENU LATERAL
    // ===================================
    const setupMenu = () => {
        hamburgerMenu?.addEventListener('click', (event) => { event.stopPropagation(); toggleMenu(); });
        document.addEventListener('click', (event) => {
            if (dropdownMenu?.classList.contains('open') && !dropdownMenu.contains(event.target) && !hamburgerMenu?.contains(event.target)) {
                toggleMenu();
            }
        });
    };

    // ===================================
    // MÓDULO: BUSCA INTERATIVA
    // ===================================
    const setupInteractiveSearch = () => {
        const searchWrapper = document.getElementById('searchWrapper'), searchInput = document.getElementById('searchInput'), searchBtn = document.getElementById('searchBtn'), searchTermBubble = document.getElementById('searchTermBubble'), searchResultsContainer = document.getElementById('searchResultsContainer'), searchResultsList = document.getElementById('searchResultsList');

        // Adiciona a classe 'expanded' ao clicar na caixa de busca, se ainda não estiver expandida
        searchWrapper?.addEventListener('click', (event) => {
            if (!searchWrapper.classList.contains('expanded')) {
                searchWrapper.classList.add('expanded');
                searchInput?.focus();
            }
        });

        const performSearch = async () => {
            if (!searchInput || !searchResultsContainer || !searchResultsList) return;
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchResultsContainer.style.display = 'none';
                searchTermBubble.style.display = 'none';
                return;
            }
            try {
                const response = await fetch(`/search_questoes?q=${encodeURIComponent(query)}`);
                if (!response.ok) throw new Error('Erro na busca.');
                const results = await response.json();
                searchTermBubble.innerHTML = `<span class="term-text">Busca: "${query}"</span><a href="/banco_questoes?q=${encodeURIComponent(query)}" class="view-all-link">Ver todos &rarr;</a>`;
                searchTermBubble.style.display = 'flex';
                searchInput.placeholder = '';
                searchResultsList.innerHTML = '';
                if (results.length > 0) {
                    results.forEach(questao => {
                        const tagsHTML = `<span class="tag tag-${questao.nivel_dificuldade.toLowerCase()}">${questao.nivel_dificuldade.replace('_', ' ')}</span> ${questao.grau_ensino ? `<span class="tag tag-grau">${questao.grau_ensino}</span>` : ''}`;
                        searchResultsList.innerHTML += `<div class="question-item" data-id="${questao.id}" data-context="search-result"><div class="question-item-content"><p><strong>#${questao.id}:</strong> ${questao.enunciado}</p><div class="question-tags">${tagsHTML}</div></div></div>`;
                    });
                } else { searchResultsList.innerHTML = `<p>Nenhum resultado rápido encontrado.</p>`; }
                searchResultsContainer.style.display = 'block';
                searchResultsContainer.classList.add('visible');
            } catch (error) {
                console.error('Erro ao realizar busca:', error);
                searchResultsList.innerHTML = `<p>Ocorreu um erro ao buscar. Tente novamente.</p>`;
                searchResultsContainer.style.display = 'block';
            }
        };
        searchBtn?.addEventListener('click', performSearch);
        searchInput?.addEventListener('keyup', (event) => { if (event.key === 'Enter') performSearch(); });

        document.addEventListener('click', (event) => {
            if (searchWrapper && !searchWrapper.contains(event.target) && searchResultsContainer && !searchResultsContainer.contains(event.target)) {
                searchResultsContainer.style.display = 'none';
                searchTermBubble.style.display = 'none';
                searchWrapper.classList.remove('expanded'); // Remove a classe 'expanded'
                if (searchInput) { searchInput.value = ''; searchInput.placeholder = 'Buscar por título, nível ou grau de ensino...'; }
            }
        });
    };

    // ===================================
    // MÓDULO: FORMULÁRIO DINÂMICO
    // ===================================
    const setupQuestionForm = () => {
        const tipoQuestaoSelect = document.getElementById('tipo_questao'), optionsContainer = document.getElementById('optionsContainer'), addOptionBtn = document.getElementById('addOptionBtn'), addOptionWrapper = document.getElementById('addOptionWrapper'), generateWithAIBtn = document.getElementById('generateWithAIBtn'), enunciadoInput = document.getElementById('enunciado'), nivelDificuldadeSelect = document.getElementById('nivel_dificuldade'), grauEnsinoSelect = document.getElementById('grau_ensino');
        let optionCount = 0;
        const addOptionField = (text = '', isCorrect = false) => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionCount++;
            const inputType = (tipoQuestaoSelect.value === 'ESCOLHA_UNICA') ? 'radio' : 'checkbox';
            const newOption = document.createElement('div');
            newOption.className = 'form-group dynamic-option';
            newOption.innerHTML = `<label for="opcao_texto_${optionCount}">Opção ${String.fromCharCode(64 + optionCount)}</label><div class="option-input-group"><input type="text" name="opcoes_texto[]" id="opcao_texto_${optionCount}" placeholder="Texto da opção" value="${text}" required><label class="correct-answer-label"><input type="${inputType}" name="respostas_corretas[]" value="${optionCount - 1}" ${isCorrect ? 'checked' : ''}><span>Correta?</span></label><button type="button" class="remove-option-btn">&times;</button></div>`;
            optionsContainer.appendChild(newOption);
            newOption.querySelector('.remove-option-btn')?.addEventListener('click', () => newOption.remove());
        };
        const updateFormUI = () => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionsContainer.innerHTML = ''; optionCount = 0;
            if (tipoQuestaoSelect.value === 'DISCURSIVA') { if (addOptionWrapper) addOptionWrapper.style.display = 'none'; }
            else { if (addOptionWrapper) addOptionWrapper.style.display = 'block'; addOptionField(); addOptionField(); }
        };

        const handleGenerateWithAI = async () => {
            const tipo = tipoQuestaoSelect.value;
            const nivel = nivelDificuldadeSelect.value;
            const grau = grauEnsinoSelect.value;

            try {
                // Remove opções existentes e reseta o formulário
                updateFormUI();
                enunciadoInput.value = '';

                showFlashMessage('Gerando questão com IA...', 'info');

                const response = await fetch('/generate_questao', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo, nivel, grau }),
                });

                if (!response.ok) {
                    throw new Error((await response.json()).error || 'Falha na comunicação com a IA.');
                }

                const data = await response.json();

                // Preenche o formulário com a resposta da IA
                enunciadoInput.value = data.enunciado;

                if (data.opcoes && data.opcoes.length > 0) {
                    optionsContainer.innerHTML = '';
                    optionCount = 0;
                    data.opcoes.forEach(op => addOptionField(op.texto, op.is_correta));
                }

                showFlashMessage('Questão gerada com sucesso! Revise e salve.', 'success');

            } catch (error) {
                console.error("Erro ao gerar questão com IA:", error);
                showFlashMessage(`Erro ao gerar questão: ${error.message}`, 'error');
            }
        };

        tipoQuestaoSelect?.addEventListener('change', updateFormUI);
        addOptionBtn?.addEventListener('click', addOptionField);
        generateWithAIBtn?.addEventListener('click', handleGenerateWithAI);
        if (tipoQuestaoSelect) updateFormUI();
    };

    // ===================================
    // MÓDULO: SELEÇÃO E EXPORTAÇÃO
    // ===================================
    const setupSelectionAndExport = () => {
        const selectionActions = document.getElementById('selectionActions'), selectionCount = document.getElementById('selectionCount'), exportBtn = document.getElementById('exportBtn'), exportFormat = document.getElementById('exportFormat'), questionList = document.querySelector('.question-list');
        const selectedIds = new Set();
        const updateSelectionUI = () => {
            const count = selectedIds.size;
            if (selectionCount) selectionCount.textContent = `${count} questão${count !== 1 ? 's' : ''} selecionada${count !== 1 ? 's' : ''}`;
            if (selectionActions) selectionActions.classList.toggle('visible', count > 0);
        };
        questionList?.addEventListener('change', (event) => {
            const checkbox = event.target.closest('.question-checkbox');
            if (!checkbox) return;
            const id = checkbox.dataset.id, questionItem = checkbox.closest('.question-item');
            if (checkbox.checked) { selectedIds.add(id); questionItem?.classList.add('selected'); }
            else { selectedIds.delete(id); questionItem?.classList.remove('selected'); }
            updateSelectionUI();
        });
        exportBtn?.addEventListener('click', async () => {
            if (selectedIds.size === 0) return alert('Selecione pelo menos uma questão para exportar.');
            const format = exportFormat.value, ids = Array.from(selectedIds);
            try {
                const response = await fetch('/export_questoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, format }) });
                if (!response.ok) throw new Error((await response.json()).error || 'Falha na exportação');
                const blob = await response.blob(), url = window.URL.createObjectURL(blob), a = document.createElement('a');
                a.style.display = 'none'; a.href = url;
                const disposition = response.headers.get('content-disposition');
                let filename = `questoes.${format}`;
                if (disposition) { const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition); if (match?.[1]) filename = match[1].replace(/['"]/g, ''); }
                a.download = filename; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
            } catch (error) { showFlashMessage(`Erro ao exportar: ${error.message}`, 'error'); }
        });
    };

    // ===================================
    // MÓDULO: MODAL DE VISUALIZAÇÃO/EDIÇÃO
    // ===================================
    const setupQuestionModal = () => {
        const questionModalOverlay = document.getElementById('questionModalOverlay'), modalCloseBtn = document.getElementById('modalCloseBtn'), modalViewContent = document.getElementById('modalViewContent'), modalEditContent = document.getElementById('modalEditContent'), modalQuestionTitle = document.getElementById('modalQuestionTitle'), modalOptionsList = document.getElementById('modalOptionsList'), modalEditBtn = document.getElementById('modalEditBtn'), modalDeleteBtn = document.getElementById('modalDeleteBtn'), modalTags = document.getElementById('modalTags'), defaultFooterButtons = document.getElementById('defaultFooterButtons'), searchFooterButtons = document.getElementById('searchFooterButtons'), modalCancelBtn = document.getElementById('modalCancelBtn'), modalGoToQuestionBtn = document.getElementById('modalGoToQuestionBtn');

        const openModal = async (questionId, context = 'default') => {
            try {
                if (!questionModalOverlay) return;
                if (defaultFooterButtons && searchFooterButtons) {
                    if (context === 'search-result') {
                        defaultFooterButtons.style.display = 'none';
                        searchFooterButtons.style.display = 'flex';
                    } else {
                        defaultFooterButtons.style.display = 'flex';
                        searchFooterButtons.style.display = 'none';
                    }
                }
                const response = await fetch(`/get_questao/${questionId}`);
                if (!response.ok) throw new Error('Falha ao buscar detalhes da questão.');
                currentQuestionData = await response.json();
                switchToViewMode();
                if (modalQuestionTitle) modalQuestionTitle.textContent = `#${currentQuestionData.id}: ${currentQuestionData.enunciado || ''}`;
                if (modalTags) { const nivel = currentQuestionData.nivel_dificuldade || 'desconhecido'; modalTags.innerHTML = `<span class="tag tag-${nivel.toLowerCase()}">${nivel.replace('_', ' ')}</span> ${currentQuestionData.grau_ensino ? `<span class="tag tag-grau">${currentQuestionData.grau_ensino}</span>` : ''}`; }
                if (modalOptionsList) {
                    modalOptionsList.innerHTML = '';
                    if (Array.isArray(currentQuestionData.opcoes) && currentQuestionData.opcoes.length > 0) { currentQuestionData.opcoes.forEach(op => { const li = document.createElement('li'); li.textContent = op.texto_opcao; if (op.is_correta) li.classList.add('correct'); modalOptionsList.appendChild(li); }); }
                    else if (currentQuestionData.tipo_questao === 'DISCURSIVA') { modalOptionsList.innerHTML = '<li>Questão discursiva não possui opções.</li>'; }
                    else { modalOptionsList.innerHTML = '<li>Não há opções para exibir.</li>'; }
                }
                if (modalDeleteBtn) modalDeleteBtn.dataset.id = questionId;
                if (modalEditBtn) modalEditBtn.dataset.id = questionId;
                if (modalGoToQuestionBtn) modalGoToQuestionBtn.dataset.id = questionId;
                questionModalOverlay.classList.add('open');
            } catch (error) { console.error("Erro ao abrir modal:", error); showFlashMessage(error.message, 'error'); }
        };

        const closeModal = () => { if (questionModalOverlay) { questionModalOverlay.classList.remove('open'); setTimeout(switchToViewMode, 300); } };

        // ===============================================
        // == FUNÇÃO switchToEditMode COMPLETA E CORRIGIDA ==
        // ===============================================
        const switchToEditMode = () => {
            if (!modalViewContent || !modalEditContent || !currentQuestionData) return;
            modalViewContent.style.display = 'none';
            modalEditContent.style.display = 'block';

            let optionsHTML = '';
            if (currentQuestionData.tipo_questao !== 'DISCURSIVA' && Array.isArray(currentQuestionData.opcoes)) {
                const inputType = currentQuestionData.tipo_questao === 'ESCOLHA_UNICA' ? 'radio' : 'checkbox';
                currentQuestionData.opcoes.forEach((opcao, index) => {
                    const isChecked = opcao.is_correta ? 'checked' : '';
                    const optionText = opcao.texto_opcao || '';
                    optionsHTML += `<div class="form-group dynamic-option"><div class="option-input-group"><input type="text" name="opcoes_texto[]" value="${optionText}" required><label class="correct-answer-label"><input type="${inputType}" name="respostas_corretas[]" value="${index}" ${isChecked}><span>Correta?</span></label></div></div>`;
                });
            }

            modalEditContent.innerHTML = `
                <form id="editQuestionForm" action="/edit_questao/${currentQuestionData.id}" method="POST">
                    <div class="form-group"><label>Enunciado</label><textarea name="enunciado" rows="4" required>${currentQuestionData.enunciado || ''}</textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label>Nível de Dificuldade</label><select name="nivel_dificuldade" required><option value="FACIL" ${currentQuestionData.nivel_dificuldade === 'FACIL' ? 'selected' : ''}>Fácil</option><option value="MEDIO" ${currentQuestionData.nivel_dificuldade === 'MEDIO' ? 'selected' : ''}>Médio</option><option value="DIFICIL" ${currentQuestionData.nivel_dificuldade === 'DIFICIL' ? 'selected' : ''}>Difícil</option></select></div>
                        <div class="form-group"><label>Grau de Ensino</label><input type="text" name="grau_ensino" value="${currentQuestionData.grau_ensino || ''}" placeholder="Ex: Ensino Médio"></div>
                    </div>
                    <input type="hidden" name="tipo_questao" value="${currentQuestionData.tipo_questao}">
                    ${optionsHTML}
                    <div class="modal-footer"><button type="button" class="secondary-btn" id="cancelEditBtn">Cancelar</button><button type="submit" class="submit-btn">Salvar Alterações</button></div>
                </form>`;
            // Adiciona o listener para o novo botão "Cancelar" do modo de edição
            document.getElementById('cancelEditBtn')?.addEventListener('click', switchToViewMode);
        };

        const switchToViewMode = () => { if (modalViewContent && modalEditContent) { modalViewContent.style.display = 'block'; modalEditContent.style.display = 'none'; modalEditContent.innerHTML = ''; } };

        const handleDeleteQuestion = async (questionId) => {
            if (!confirm(`Tem certeza que deseja mover a questão #${questionId} para a lixeira?`)) return;
            try {
                const response = await fetch(`/delete_questao/${questionId}`, { method: 'POST' });
                if (!response.ok) throw new Error((await response.json()).error || 'Falha ao excluir.');
                location.reload();
            } catch (error) { showFlashMessage(error.message, 'error'); }
        };

        document.body.addEventListener('click', async (event) => {
            const target = event.target, questionItem = target.closest('.question-item');
            if (questionItem && !target.closest('.question-checkbox, .delete-btn, .restore-btn, .perm-delete-btn, a')) {
                const questionId = questionItem.dataset.id, context = questionItem.dataset.context;
                if (questionId) openModal(questionId, context);
            }
            const deleteBtn = target.closest('.delete-btn:not(.modal-delete-btn)');
            if (deleteBtn) handleDeleteQuestion(deleteBtn.dataset.id);
            const restoreBtn = target.closest('.restore-btn');
            if (restoreBtn) {
                try {
                    const response = await fetch(`/restore_questao/${restoreBtn.dataset.id}`, { method: 'POST' });
                    if (!response.ok) throw new Error((await response.json()).error || 'Falha ao restaurar.');
                    location.reload();
                } catch (error) { showFlashMessage(error.message, 'error'); }
            }
            const permDeleteBtn = target.closest('.perm-delete-btn');
            if (permDeleteBtn) {
                if (!confirm(`EXCLUSÃO PERMANENTE: Deseja apagar a questão #${permDeleteBtn.dataset.id} para sempre?`)) return;
                try {
                    const response = await fetch(`/delete_permanently/${permDeleteBtn.dataset.id}`, { method: 'POST' });
                    if (!response.ok) throw new Error((await response.json()).error || 'Falha ao excluir permanentemente.');
                    location.reload();
                } catch (error) { showFlashMessage(error.message, 'error'); }
            }
        });

        modalCancelBtn?.addEventListener('click', closeModal);
        modalGoToQuestionBtn?.addEventListener('click', () => {
            const questionId = modalGoToQuestionBtn.dataset.id;
            if (questionId) {
                window.location.href = `/banco_questoes#questao-${questionId}`;
            }
        });

        // Listener para o botão de editar principal
        modalEditBtn?.addEventListener('click', switchToEditMode);

        modalDeleteBtn?.addEventListener('click', () => { if (modalDeleteBtn.dataset.id) { handleDeleteQuestion(modalDeleteBtn.dataset.id); closeModal(); } });
        modalCloseBtn?.addEventListener('click', closeModal);
        questionModalOverlay?.addEventListener('click', e => { if (e.target === questionModalOverlay) closeModal(); });
    };

    // ===================================
    // === NOVO MÓDULO: CHAT COM IA ===
    // ===================================
    const setupAIChat = () => {
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatMessages = document.getElementById('chat-messages');
        if (!chatForm || !chatInput || !chatMessages) return;

        let conversationHistory = [];

        const addMessage = (sender, message) => {
            const messageElement = document.createElement('div');
            messageElement.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
            messageElement.textContent = message;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userMessage = chatInput.value.trim();
            if (!userMessage) return;

            addMessage('user', userMessage);
            chatInput.value = '';
            conversationHistory.push(['Usuário', userMessage]);

            // Adiciona uma mensagem de "digitando..."
            const typingIndicator = document.createElement('div');
            typingIndicator.classList.add('ai-message', 'typing');
            typingIndicator.textContent = 'Digitando...';
            chatMessages.appendChild(typingIndicator);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userMessage, history: conversationHistory }),
                });

                chatMessages.removeChild(typingIndicator); // Remove o "digitando..."

                if (!response.ok) {
                    throw new Error('Erro na comunicação com a IA.');
                }

                const data = await response.json();
                let aiResponse;

                if (data.type === 'question') {
                    // Formata a questão como uma string para exibição no chat
                    aiResponse = `Ok, aqui está uma sugestão de questão:\n\n` +
                                 `Enunciado: ${data.data.enunciado}\n` +
                                 `Tipo: ${data.data.tipo}\n` +
                                 `Nível: ${data.data.nivel}\n` +
                                 `Grau: ${data.data.grau}\n`;
                    if(data.data.opcoes && data.data.opcoes.length > 0){
                        aiResponse += `Opções:\n`;
                        data.data.opcoes.forEach((op, i) => {
                            aiResponse += `${i+1}. ${op.texto} ${op.is_correta ? '(Correta)' : ''}\n`;
                        });
                    }
                } else {
                    aiResponse = data.message;
                }

                addMessage('ai', aiResponse);
                conversationHistory.push(['IA', aiResponse]);

            } catch (error) {
                console.error('Erro no chat com IA:', error);
                addMessage('ai', 'Desculpe, ocorreu um erro. Tente novamente.');
            }
        });
    };

    // ===================================
    // INICIALIZAÇÃO DE TODOS OS MÓDULOS
    // ===================================
    setupThemeToggler();
    setupLoginForm();
    setupProfilePhotoUpload();
    setupMenu();
    setupInteractiveSearch();
    setupQuestionForm();
    setupSelectionAndExport();
    setupQuestionModal();
    setupAIChat(); // <-- CHAMADA DA NOVA FUNÇÃO
});